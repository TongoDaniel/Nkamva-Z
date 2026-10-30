// ==========================================================================
// Lot 3 — Retraits formateur
// ==========================================================================
// Machine à états Payout P1-P8.
//
// Invariants tenus par ce module :
//   Wallet.pendingPayoutBalance = SUM(Payout.amountFcfa WHERE status IN
//                                     (PENDING, AUTO_APPROVED, IN_REVIEW, APPROVED))
//   solde retirable = balance - reservedBalance - pendingPayoutBalance
//   - les réservations de litige n'écrivent jamais dans pendingPayoutBalance,
//     et réciproquement (cf. src/lib/disputes.ts)
//   - `balance` n'est débité qu'au versement effectif (P6), jamais avant
//   - décision 25 : le premier retrait est TOUJOURS en revue manuelle
// ==========================================================================

import type { PayoutStatus, Prisma } from '@prisma/client'
import { db } from './db'
import { audit, auditStandalone } from './audit'
import { notify, notifyAdminSubRole, deliverSideEffects } from './notification'
import { syncNegativeSince, withdrawableBalance } from './wallet'
import { computeKycScore, KYC_THRESHOLD_VERIFIED } from './kyc'
import { getWithdrawableMethod, getPayoutReviewSlaHours } from './payout-methods'
// Aliasé : ce module exporte déjà `requestPayout`, qui est la demande du
// formateur — l'homonyme de PawaPay est l'ordre de virement.
import {
  assertWithinBounds, isPawaPayConfigured, providerForOperator, toMsisdn,
  requestPayout as requestPawaPayPayout, PawaPayError,
} from './pawapay'
import { settleAmount } from './fx'
import type { PrismaTransaction } from './types'

export { PAYOUT_MIN_AMOUNT_FCFA } from './rules'
import { PAYOUT_MIN_AMOUNT_FCFA } from './rules'
import { fmtFcfa } from './format'

// Source unique dans `payout-methods.ts` : le même délai servait aux deux
// familles d'écrans depuis deux constantes distinctes. Il vit désormais en
// base (réglage `payouts.review_sla_hours`), d'où la lecture asynchrone.
export { getPayoutReviewSlaHours } from './payout-methods'

/** Retraits « en vol » : ceux qui immobilisent du solde. */
export const IN_FLIGHT_PAYOUT_STATUSES: PayoutStatus[] = ['PENDING', 'AUTO_APPROVED', 'IN_REVIEW', 'APPROVED']

async function recordTransition(
  tx: PrismaTransaction,
  params: {
    payoutId: string
    fromStatus: PayoutStatus
    toStatus: PayoutStatus
    actorId: string | null
    actorRole: string
    note?: string | null
  },
) {
  await tx.payoutReviewEvent.create({
    data: {
      payoutId: params.payoutId,
      fromStatus: params.fromStatus,
      toStatus: params.toStatus,
      actorId: params.actorId,
      actorRole: params.actorRole,
      note: params.note ?? null,
    },
  })
}

// ==========================================================================
// P1 / P2 / P3 — demande de retrait
// ==========================================================================

/**
 * Frais retenus sur un versement de clôture — arbitrage 6.
 *
 * ⚠️ **Valeur retenue par défaut, non arbitrée** : elle est ici pour être
 * discutée, pas pour être découverte au fond d'une condition. Le coût réel d'un
 * transfert dépend du fournisseur et du corridor ; tant qu'aucune grille n'est
 * administrée, un forfait vaut mieux qu'un montant inventé à chaque appel.
 */
export const CLOSING_PAYOUT_FEE_FCFA = 500

/**
 * Le reliquat qu'aucun versement ne peut sortir : positif, mais pas au-delà des
 * frais de clôture (`AMOUNT_BELOW_FEES`), et rien de réservé ni d'engagé.
 * `null` si le solde n'est pas dans ce cas.
 *
 * La suppression du compte exigeait un solde nul : ce reliquat la bloquait pour
 * toujours (audit du 28 octobre 2026, A3). Il peut désormais être abandonné, sur
 * consentement exprès, et il est débité à la purge.
 */
export function abandonableResidueFcfa(wallet: {
  balance: number
  reservedBalance: number
  pendingPayoutBalance: number
}): number | null {
  const { balance, reservedBalance, pendingPayoutBalance } = wallet
  if (reservedBalance !== 0 || pendingPayoutBalance !== 0) return null
  return balance > 0 && balance <= CLOSING_PAYOUT_FEE_FCFA ? balance : null
}

export async function requestPayout(
  trainerProfileId: string,
  userId: string,
  amountFcfa: number,
  /**
   * Versement de clôture (arbitrage 6) : dispense du minimum, frais retenus sur
   * le montant. **Réservé à l'espace en état de solde** — un formateur en
   * activité n'a aucune raison d'y avoir droit, et l'ouvrir à tous viderait le
   * plancher de son sens.
   */
  options: { closing?: boolean } = {},
) {
  if (!Number.isInteger(amountFcfa) || amountFcfa <= 0) throw new Error('AMOUNT_BELOW_MINIMUM')

  const closing = options.closing === true
  if (closing) {
    const profile = await db.trainerProfile.findUnique({
      where: { id: trainerProfileId },
      select: { subscriptionStatus: true },
    })
    if (profile?.subscriptionStatus !== 'CANCELED') throw new Error('NOT_CLOSING')
    // Les frais sont retenus sur le montant : un reliquat qui ne les couvre pas
    // ne peut pas être versé — le transfert coûterait plus que ce qu'il rend.
    if (amountFcfa <= CLOSING_PAYOUT_FEE_FCFA) throw new Error('AMOUNT_BELOW_FEES')
  } else if (amountFcfa < PAYOUT_MIN_AMOUNT_FCFA) {
    throw new Error('AMOUNT_BELOW_MINIMUM')
  }

  const wallet = await db.wallet.findUnique({ where: { trainerId: trainerProfileId } })
  if (!wallet) throw new Error('WALLET_NOT_FOUND')

  // Un seul retrait en vol à la fois : deux demandes concurrentes pourraient
  // ensemble dépasser le solde retirable.
  const inFlight = await db.payout.count({
    where: { trainerId: trainerProfileId, status: { in: IN_FLIGHT_PAYOUT_STATUSES } },
  })
  if (inFlight > 0) throw new Error('PAYOUT_IN_PROGRESS')

  // Le moyen de paiement doit être VERIFIED et sa carence 72 h écoulée.
  const { method, reason } = await getWithdrawableMethod(trainerProfileId)
  if (!method) throw new Error(reason)

  // Le solde réservé par les litiges et celui déjà engagé par un retrait
  // sortent tous deux du montant disponible.
  const available = withdrawableBalance(wallet)
  if (amountFcfa > available) throw new Error('INSUFFICIENT_WITHDRAWABLE_BALANCE')

  const kyc = await computeKycScore(trainerProfileId)

  // Décision 25 — l'auto-approbation ne s'applique qu'à partir du 2e retrait,
  // quel que soit le score.
  const autoApproved = kyc.score >= KYC_THRESHOLD_VERIFIED && !kyc.firstPayout && !kyc.carenceActive
  const status: PayoutStatus = autoApproved ? 'AUTO_APPROVED' : 'IN_REVIEW'

  const payout = await db.$transaction(async (tx) => {
    const created = await tx.payout.create({
      data: {
        trainerId: trainerProfileId,
        payoutMethodId: method.id,
        amountFcfa,
        feeFcfa: closing ? CLOSING_PAYOUT_FEE_FCFA : 0,
        isClosingPayout: closing,
        status,
        // Le score est figé : la décision doit rester auditable même si le
        // score du formateur évolue ensuite.
        kycScoreSnapshot: kyc.score,
        kycBadgeSnapshot: kyc.badge,
        kycCriteriaSnapshot: kyc.criteria as unknown as Prisma.InputJsonValue,
        isFirstPayout: kyc.firstPayout,
        carenceHolds: kyc.carenceActive,
        ...(autoApproved
          ? { wireInitiatedAt: new Date(), approvedAt: new Date() }
          : {}),
      },
    })

    // P1 — le montant est immobilisé dès la demande, mais `balance` n'est pas
    // touché : le formateur n'est débité qu'au versement effectif (P6).
    //
    // L'immobilisation porte sa propre condition de solde, en SQL, plutôt que
    // de se fier au contrôle lu plus haut. Deux demandes concurrentes lisent la
    // même valeur avant d'écrire — c'est le cas que le contrôle hors
    // transaction ne peut pas voir — et repartaient toutes deux approuvées :
    // en auto-approbation (décision 25) il n'y a aucune revue Finances pour
    // rattraper, et le portefeuille passait en négatif au versement.
    // Postgres réévalue le WHERE après avoir verrouillé la ligne : la seconde
    // écriture ne trouve plus le solde et repart en 422.
    const immobilized = await tx.$executeRaw`
      UPDATE "wallets"
      SET "pendingPayoutBalance" = "pendingPayoutBalance" + ${amountFcfa}
      WHERE "id" = ${wallet.id}
        AND "balance" - "reservedBalance" - "pendingPayoutBalance" >= ${amountFcfa}
    `
    if (immobilized === 0) throw new Error('INSUFFICIENT_WITHDRAWABLE_BALANCE')

    await syncNegativeSince(tx, wallet.id)

    if (autoApproved) {
      await tx.payout.update({
        where: { id: created.id },
        data: { idempotencyKey: `payout:${created.id}` },
      })
    }

    await recordTransition(tx, {
      payoutId: created.id, fromStatus: 'PENDING', toStatus: status,
      actorId: userId, actorRole: 'TRAINER',
      note: autoApproved ? 'Auto-approuvé (KYC ≥ 80, retrait non initial)' : 'Revue manuelle Finances',
    })
    await audit(tx, {
      actorId: userId, actorRole: 'TRAINER',
      action: 'PAYOUT_REQUESTED', targetType: 'Payout', targetId: created.id,
      meta: {
        amountFcfa, status, kycScore: kyc.score, isFirstPayout: kyc.firstPayout,
        availableBefore: available, payoutMethodId: method.id,
      },
    })

    return tx.payout.findUniqueOrThrow({ where: { id: created.id } })
  })

  await deliverSideEffects('PAYOUT_REQUESTED', { type: 'Payout', id: payout.id }, () =>
    notifyAdminSubRole('FINANCES', {
      type: autoApproved ? 'PAYOUT_AUTO_APPROVED' : 'PAYOUT_TO_REVIEW',
      title: autoApproved ? 'Retrait auto-approuvé à verser' : 'Retrait à instruire',
      body: `${amountFcfa} FCFA${kyc.firstPayout ? ', premier retrait, revue obligatoire' : ''}.`,
      link: `/admin/retraits/${payout.id}`,
    }),
  )

  // Un retrait auto-approuvé n'attend aucune décision humaine : il part tout de
  // suite. Sans cette ligne, l'auto-approbation ne ferait que déplacer
  // l'attente, et Finances devrait quand même virer à la main.
  if (autoApproved) await dispatchPayout(payout.id)

  return payout
}

// ==========================================================================
// P4 — IN_REVIEW → APPROVED
// ==========================================================================

export interface ReviewPayoutInput {
  expectedUpdatedAt: string
  actorId: string
  actorRole: string
  note?: string | null
}

export async function approvePayout(payoutId: string, input: ReviewPayoutInput) {
  const payout = await db.payout.findUnique({
    where: { id: payoutId },
    include: { trainerProfile: { select: { id: true, userId: true } } },
  })
  if (!payout) throw new Error('PAYOUT_NOT_FOUND')
  if (payout.status !== 'IN_REVIEW') throw new Error('PAYOUT_NOT_IN_REVIEW')

  // Re-vérification au moment de la décision : le solde et le KYC ont pu bouger
  // depuis la demande (un litige ouvert entre-temps, par exemple).
  const wallet = await db.wallet.findUnique({ where: { trainerId: payout.trainerId } })
  if (!wallet) throw new Error('WALLET_NOT_FOUND')
  // Ce retrait est déjà compté dans pendingPayoutBalance. Le solde retirable
  // restant doit donc être ≥ 0 : négatif signifierait qu'un litige ouvert
  // depuis la demande a réservé des fonds qui ne couvrent plus ce virement.
  if (withdrawableBalance(wallet) < 0) throw new Error('INSUFFICIENT_WITHDRAWABLE_BALANCE')

  const { method, reason } = await getWithdrawableMethod(payout.trainerId)
  if (!method) throw new Error(reason)

  await db.$transaction(async (tx) => {
    const guard = await tx.payout.updateMany({
      where: { id: payoutId, updatedAt: new Date(input.expectedUpdatedAt), status: 'IN_REVIEW' },
      data: {
        status: 'APPROVED',
        approvedById: input.actorId,
        approvedAt: new Date(),
        reviewedById: input.actorId,
        reviewedAt: new Date(),
        wireInitiatedAt: new Date(),
        // Clé d'idempotence côté provider : un rejeu ne déclenche pas 2 virements.
        idempotencyKey: `payout:${payoutId}`,
      },
    })
    if (guard.count === 0) throw new Error('STALE_PAYOUT')

    await recordTransition(tx, {
      payoutId, fromStatus: 'IN_REVIEW', toStatus: 'APPROVED',
      actorId: input.actorId, actorRole: input.actorRole, note: input.note ?? null,
    })
    await audit(tx, {
      actorId: input.actorId, actorRole: input.actorRole,
      action: 'PAYOUT_APPROVED', targetType: 'Payout', targetId: payoutId,
      meta: { amountFcfa: payout.amountFcfa },
    })
  })

  await deliverSideEffects('PAYOUT_APPROVED', { type: 'Payout', id: payoutId }, () =>
    notify(payout.trainerProfile.userId, {
      type: 'PAYOUT_APPROVED',
      title: 'Votre retrait est approuvé',
      body: `${payout.amountFcfa} FCFA sont en cours de virement.`,
      link: '/formateur/portefeuille',
    }),
  )

  // Approuver ne versait rien : un administrateur allait faire le virement à la
  // main, puis revenait cocher « payé ». Le mobile money part désormais tout
  // seul — l'IBAN, lui, reste manuel (voir `dispatchPayout`).
  await dispatchPayout(payoutId)

  return db.payout.findUniqueOrThrow({ where: { id: payoutId } })
}

// ==========================================================================
// P5 bis — exécution du versement chez le fournisseur
// ==========================================================================

/**
 * Envoie le virement à PawaPay quand le moyen de paiement est un mobile money.
 *
 * Ce que ça change : `markPayoutPaid` était purement déclaratif — il enregistrait
 * qu'un humain affirmait avoir viré. Le versement est maintenant réellement
 * ordonné ici, et c'est le callback `/api/webhooks/pawapay/payouts` qui viendra
 * appeler `markPayoutPaid` ou `markPayoutFailed`.
 *
 * ⚠️ **L'IBAN reste manuel.** PawaPay ne distribue que du mobile money
 * (`recipient.type: MMO`). Un retrait vers un compte bancaire suit exactement le
 * circuit d'avant : Finances vire, puis marque payé depuis la console. Idem pour
 * un opérateur que PawaPay ne dessert pas — Wave notamment.
 *
 * Ne lève jamais : l'échec d'expédition ne doit pas défaire une approbation
 * valide. Le retrait reste APPROVED, visible dans la file Finances, et
 * rattrapable à la main.
 */
export async function dispatchPayout(payoutId: string): Promise<void> {
  const payout = await db.payout.findUnique({
    where: { id: payoutId },
    include: {
      payoutMethod: { select: { type: true, mobileOperator: true, mobilePhone: true } },
      trainerProfile: { select: { user: { select: { countryCode: true } } } },
    },
  })
  if (!payout || !['APPROVED', 'AUTO_APPROVED'].includes(payout.status)) return

  const method = payout.payoutMethod
  if (method.type !== 'MOBILE_MONEY' || !method.mobileOperator || !method.mobilePhone) {
    await auditStandalone({
      action: 'PAYOUT_DISPATCH_MANUAL', targetType: 'Payout', targetId: payoutId,
      meta: { reason: 'NOT_MOBILE_MONEY', methodType: method.type },
    })
    return
  }

  if (!isPawaPayConfigured()) {
    await auditStandalone({
      action: 'PAYOUT_DISPATCH_MANUAL', targetType: 'Payout', targetId: payoutId,
      meta: { reason: 'PAWAPAY_NOT_CONFIGURED' },
    })
    return
  }

  const country = payout.trainerProfile.user.countryCode ?? 'CM'
  const provider = await providerForOperator(method.mobileOperator, country, 'PAYOUT').catch(() => null)
  if (!provider) {
    await auditStandalone({
      action: 'PAYOUT_DISPATCH_MANUAL', targetType: 'Payout', targetId: payoutId,
      meta: { reason: 'PROVIDER_NOT_SUPPORTED', operator: method.mobileOperator, country },
    })
    return
  }

  try {
    // Le solde du formateur est en FCFA ; l'opérateur vire dans sa devise. Sans
    // taux administré pour celle-ci, `settleAmount` lève et le versement bascule
    // en traitement manuel plutôt que de partir avec un montant faux.
    const { converted } = await settleAmount([provider], payout.amountFcfa)
    assertWithinBounds(provider, converted.amount)

    // `payoutId` est l'identifiant PawaPay : c'est déjà un UUID, il vaut clé
    // d'idempotence et évite une colonne de correspondance de plus.
    const response = await requestPawaPayPayout({
      payoutId,
      phoneNumber: toMsisdn(method.mobilePhone, provider.prefix),
      provider: provider.provider,
      amount: converted.amount,
      currency: converted.currency,
      customerMessage: 'Retrait NKAMVA',
      clientReferenceId: payoutId,
    })

    if (response.status === 'REJECTED') {
      await markPayoutFailed(payoutId, {
        reason:
          response.failureReason?.failureMessage ||
          response.failureReason?.failureCode ||
          'Versement refusé par le fournisseur',
        actorId: null,
        actorRole: 'SYSTEM',
      })
      return
    }

    await auditStandalone({
      action: 'PAYOUT_DISPATCHED', targetType: 'Payout', targetId: payoutId,
      meta: {
        provider: 'PAWAPAY', providerCode: provider.provider,
        amountFcfa: payout.amountFcfa,
        // Ce qui est réellement parti chez l'opérateur : sans la devise, un
        // rapprochement comptable ne peut pas relire cette ligne.
        amount: converted.amount, currency: converted.currency, fxRate: converted.rate,
        status: response.status,
      },
    })
  } catch (err) {
    // Le retrait reste APPROVED : Finances le voit toujours dans sa file et
    // peut le reprendre. Échouer bruyamment ici annulerait une approbation qui,
    // elle, était valide.
    await auditStandalone({
      action: 'PAYOUT_DISPATCH_FAILED', targetType: 'Payout', targetId: payoutId,
      meta: { error: err instanceof PawaPayError ? (err.failureCode ?? err.message) : String(err) },
    })
  }
}

// ==========================================================================
// P5 — IN_REVIEW → REJECTED (libère l'engagement, ne touche pas balance)
// ==========================================================================

export async function rejectPayout(payoutId: string, input: ReviewPayoutInput & { reason: string }) {
  const payout = await db.payout.findUnique({
    where: { id: payoutId },
    include: { trainerProfile: { select: { userId: true } } },
  })
  if (!payout) throw new Error('PAYOUT_NOT_FOUND')
  if (payout.status !== 'IN_REVIEW') throw new Error('PAYOUT_NOT_IN_REVIEW')

  await db.$transaction(async (tx) => {
    const guard = await tx.payout.updateMany({
      where: { id: payoutId, updatedAt: new Date(input.expectedUpdatedAt), status: 'IN_REVIEW' },
      data: {
        status: 'REJECTED',
        rejectedById: input.actorId,
        rejectedAt: new Date(),
        rejectionReason: input.reason,
        reviewedById: input.actorId,
        reviewedAt: new Date(),
      },
    })
    if (guard.count === 0) throw new Error('STALE_PAYOUT')

    await releaseEngagement(tx, payout.trainerId, payout.amountFcfa)

    await recordTransition(tx, {
      payoutId, fromStatus: 'IN_REVIEW', toStatus: 'REJECTED',
      actorId: input.actorId, actorRole: input.actorRole, note: input.reason,
    })
    await audit(tx, {
      actorId: input.actorId, actorRole: input.actorRole,
      action: 'PAYOUT_REJECTED', targetType: 'Payout', targetId: payoutId,
      meta: { amountFcfa: payout.amountFcfa, reason: input.reason },
    })
  })

  await deliverSideEffects('PAYOUT_REJECTED', { type: 'Payout', id: payoutId }, () =>
    notify(payout.trainerProfile.userId, {
      type: 'PAYOUT_REJECTED',
      title: 'Votre demande de retrait a été refusée',
      body: input.reason,
      link: '/formateur/portefeuille',
    }),
  )

  return db.payout.findUniqueOrThrow({ where: { id: payoutId } })
}

/** Libère le montant immobilisé sans toucher au solde disponible. */
async function releaseEngagement(tx: PrismaTransaction, trainerProfileId: string, amountFcfa: number) {
  const wallet = await tx.wallet.findUniqueOrThrow({ where: { trainerId: trainerProfileId } })
  await tx.wallet.update({
    where: { id: wallet.id },
    data: { pendingPayoutBalance: { decrement: amountFcfa } },
  })
  await syncNegativeSince(tx, wallet.id)
}

// ==========================================================================
// P6 — versement effectif
// ==========================================================================

export async function markPayoutPaid(
  payoutId: string,
  input: { providerReference?: string | null; receiptS3Key?: string | null; actorId: string | null; actorRole: string },
) {
  const payout = await db.payout.findUnique({
    where: { id: payoutId },
    include: { trainerProfile: { select: { userId: true } } },
  })
  if (!payout) throw new Error('PAYOUT_NOT_FOUND')
  if (payout.status === 'PAID') return payout // idempotent : rejeu webhook
  if (!['APPROVED', 'AUTO_APPROVED'].includes(payout.status)) throw new Error('PAYOUT_NOT_APPROVED')

  await db.$transaction(async (tx) => {
    const guard = await tx.payout.updateMany({
      where: { id: payoutId, status: payout.status },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        providerReference: input.providerReference ?? null,
        receiptS3Key: input.receiptS3Key ?? null,
      },
    })
    if (guard.count === 0) throw new Error('STALE_PAYOUT')

    // P6 — c'est ici, et seulement ici, que le formateur est réellement débité.
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { trainerId: payout.trainerId } })
    await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        pendingPayoutBalance: { decrement: payout.amountFcfa },
        balance: { decrement: payout.amountFcfa },
      },
    })
    await syncNegativeSince(tx, wallet.id)

    await recordTransition(tx, {
      payoutId, fromStatus: payout.status, toStatus: 'PAID',
      actorId: input.actorId, actorRole: input.actorRole,
    })
    await audit(tx, {
      actorId: input.actorId, actorRole: input.actorRole,
      action: 'PAYOUT_PAID', targetType: 'Payout', targetId: payoutId,
      meta: { amountFcfa: payout.amountFcfa, providerReference: input.providerReference ?? null },
    })
  })

  await deliverSideEffects('PAYOUT_PAID', { type: 'Payout', id: payoutId }, () =>
    notify(payout.trainerProfile.userId, {
      type: 'PAYOUT_PAID',
      title: 'Votre retrait a été versé',
      body: `${payout.amountFcfa} FCFA ont été virés sur votre compte.`,
      link: '/formateur/portefeuille',
    }),
  )

  return db.payout.findUniqueOrThrow({ where: { id: payoutId } })
}

// ==========================================================================
// P7 / P8 — échec du virement, puis reprise
// ==========================================================================

export async function markPayoutFailed(
  payoutId: string,
  input: { reason: string; actorId: string | null; actorRole: string },
) {
  const payout = await db.payout.findUnique({
    where: { id: payoutId },
    include: { trainerProfile: { select: { userId: true } } },
  })
  if (!payout) throw new Error('PAYOUT_NOT_FOUND')
  if (payout.status === 'FAILED') return payout
  if (!['APPROVED', 'AUTO_APPROVED'].includes(payout.status)) throw new Error('PAYOUT_NOT_APPROVED')

  await db.$transaction(async (tx) => {
    const guard = await tx.payout.updateMany({
      where: { id: payoutId, status: payout.status },
      data: { status: 'FAILED', failedAt: new Date(), failureReason: input.reason },
    })
    if (guard.count === 0) throw new Error('STALE_PAYOUT')

    // Le virement n'a pas eu lieu : l'engagement tombe, le solde reste intact.
    await releaseEngagement(tx, payout.trainerId, payout.amountFcfa)

    await recordTransition(tx, {
      payoutId, fromStatus: payout.status, toStatus: 'FAILED',
      actorId: input.actorId, actorRole: input.actorRole, note: input.reason,
    })
    await audit(tx, {
      actorId: input.actorId, actorRole: input.actorRole,
      action: 'PAYOUT_FAILED', targetType: 'Payout', targetId: payoutId,
      meta: { amountFcfa: payout.amountFcfa, reason: input.reason },
    })
  })

  await deliverSideEffects('PAYOUT_FAILED', { type: 'Payout', id: payoutId }, async () => {
    await notify(payout.trainerProfile.userId, {
      type: 'PAYOUT_FAILED',
      title: 'Votre virement a échoué',
      body: `${input.reason}. Les fonds sont de nouveau disponibles sur votre portefeuille.`,
      link: '/formateur/portefeuille',
    })
    await notifyAdminSubRole('FINANCES', {
      type: 'PAYOUT_FAILED',
      title: 'Échec de virement à reprendre',
      body: `${fmtFcfa(payout.amountFcfa)} : ${input.reason}`,
      link: `/admin/retraits/${payoutId}`,
    })
  })

  return db.payout.findUniqueOrThrow({ where: { id: payoutId } })
}

export async function reopenPayout(payoutId: string, input: { actorId: string; actorRole: string }) {
  const payout = await db.payout.findUnique({ where: { id: payoutId } })
  if (!payout) throw new Error('PAYOUT_NOT_FOUND')
  if (payout.status !== 'FAILED') throw new Error('PAYOUT_NOT_FAILED')

  await db.$transaction(async (tx) => {
    const guard = await tx.payout.updateMany({
      where: { id: payoutId, status: 'FAILED' },
      data: { status: 'IN_REVIEW', failedAt: null, failureReason: null, reviewedById: input.actorId, reviewedAt: new Date() },
    })
    if (guard.count === 0) throw new Error('STALE_PAYOUT')

    // Le montant est de nouveau immobilisé le temps de la nouvelle instruction.
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { trainerId: payout.trainerId } })
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { pendingPayoutBalance: { increment: payout.amountFcfa } },
    })
    await syncNegativeSince(tx, wallet.id)

    await recordTransition(tx, {
      payoutId, fromStatus: 'FAILED', toStatus: 'IN_REVIEW',
      actorId: input.actorId, actorRole: input.actorRole, note: 'Reprise après échec',
    })
    await audit(tx, {
      actorId: input.actorId, actorRole: input.actorRole,
      action: 'PAYOUT_REOPENED', targetType: 'Payout', targetId: payoutId,
      meta: { amountFcfa: payout.amountFcfa },
    })
  })

  return db.payout.findUniqueOrThrow({ where: { id: payoutId } })
}

// ==========================================================================
// Lectures
// ==========================================================================

export async function listMyPayouts(trainerProfileId: string, page = 1, pageSize = 20) {
  const [items, total] = await Promise.all([
    db.payout.findMany({
      where: { trainerId: trainerProfileId },
      include: { payoutMethod: { select: { id: true, type: true, accountNature: true } } },
      orderBy: { submittedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.payout.count({ where: { trainerId: trainerProfileId } }),
  ])
  return { items, total, page, pageSize }
}

export async function getPayoutForTrainer(payoutId: string, trainerProfileId: string) {
  const payout = await db.payout.findUnique({
    where: { id: payoutId },
    include: {
      payoutMethod: { select: { id: true, type: true, accountNature: true } },
      reviewEvents: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!payout) throw new Error('PAYOUT_NOT_FOUND')
  if (payout.trainerId !== trainerProfileId) throw new Error('NOT_OWNER')
  return payout
}

export async function listPayouts(filters: { status?: PayoutStatus; page?: number; pageSize?: number }) {
  const page = filters.page ?? 1
  const pageSize = Math.min(filters.pageSize ?? 20, 50)
  const where = filters.status ? { status: filters.status } : {}

  const [items, total] = await Promise.all([
    db.payout.findMany({
      where,
      include: {
        trainerProfile: {
          select: { id: true, verifiedLegalName: true, user: { select: { id: true, email: true, fullName: true, avatarS3Key: true, avatarUrl: true } } },
        },
        payoutMethod: { select: { id: true, type: true, accountNature: true, verificationStatus: true } },
      },
      orderBy: { submittedAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.payout.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function getPayoutDetail(payoutId: string) {
  const payout = await db.payout.findUnique({
    where: { id: payoutId },
    include: {
      trainerProfile: {
        select: {
          id: true, verifiedLegalName: true,
          user: { select: { id: true, email: true, fullName: true, avatarS3Key: true, avatarUrl: true } },
          wallet: { select: { balance: true, reservedBalance: true, pendingPayoutBalance: true, negativeSince: true } },
        },
      },
      payoutMethod: true,
      reviewEvents: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!payout) throw new Error('PAYOUT_NOT_FOUND')
  return payout
}

/**
 * `slaHours` voyage avec `slaBreaches` : la tuile dit « hors délai (> N h) »,
 * et le N doit être celui qui a servi à compter — pas une seconde lecture du
 * réglage côté écran, qui pourrait tomber entre les deux.
 */
export async function getPayoutStats() {
  const slaHours = await getPayoutReviewSlaHours()
  const [byStatus, inFlightSum, paidSum, slaBreaches] = await Promise.all([
    db.payout.groupBy({ by: ['status'], _count: { _all: true } }),
    db.payout.aggregate({ where: { status: { in: IN_FLIGHT_PAYOUT_STATUSES } }, _sum: { amountFcfa: true } }),
    db.payout.aggregate({ where: { status: 'PAID' }, _sum: { amountFcfa: true } }),
    db.payout.count({
      where: {
        status: 'IN_REVIEW',
        submittedAt: { lt: new Date(Date.now() - slaHours * 3_600_000) },
      },
    }),
  ])

  const counts = Object.fromEntries(byStatus.map(r => [r.status, r._count._all]))
  return {
    byStatus: counts,
    pendingReview: counts.IN_REVIEW ?? 0,
    inFlightTotalFcfa: inFlightSum._sum.amountFcfa ?? 0,
    paidTotalFcfa: paidSum._sum.amountFcfa ?? 0,
    slaBreaches,
    slaHours,
  }
}

// ==========================================================================
// Alerte SLA des retraits en revue (job horaire)
// ==========================================================================

export async function alertPayoutSlaBreaches(): Promise<{ breached: number }> {
  const slaHours = await getPayoutReviewSlaHours()
  const threshold = new Date(Date.now() - slaHours * 3_600_000)
  const breached = await db.payout.count({ where: { status: 'IN_REVIEW', submittedAt: { lt: threshold } } })

  if (breached > 0) {
    await notifyAdminSubRole('FINANCES', {
      type: 'PAYOUT_SLA_BREACH',
      title: `${breached} retrait(s) en attente depuis plus de ${slaHours} h`,
      body: 'Le SLA de revue manuelle est dépassé.',
      link: '/admin/retraits?status=IN_REVIEW',
    })
  }

  return { breached }
}
