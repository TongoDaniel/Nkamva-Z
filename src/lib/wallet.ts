import { db } from './db'
import { audit } from './audit'
import { activateMembershipForPurchase } from './memberships'
import { markCourseObligation } from './course-obligation'
import { restoreSuspendedCatalog } from './catalog-suspension'
import type { PaymentProvider, WalletDebitReason } from '@prisma/client'
import type { PrismaTransaction } from './types'

export interface CreditWalletOnPurchaseResult { credited: boolean; purchaseId: string | null; trainerId: string | null; amountFcfa: number; trainerShareFcfa: number }

/** solde retirable = balance - reservedBalance - pendingPayoutBalance */
export function withdrawableBalance(wallet: { balance: number; reservedBalance: number; pendingPayoutBalance: number }): number {
  return wallet.balance - wallet.reservedBalance - wallet.pendingPayoutBalance
}

/**
 * Invariant : `negativeSince` non null ⟺ solde retirable < 0.
 * À rappeler après tout mouvement de solde — débit de litige comme payout —
 * sinon l'alerte « wallet négatif > 60 jours » ne se déclenche jamais.
 */
export async function syncNegativeSince(tx: PrismaTransaction, walletId: string): Promise<void> {
  const wallet = await tx.wallet.findUnique({
    where: { id: walletId },
    select: { balance: true, reservedBalance: true, pendingPayoutBalance: true, negativeSince: true },
  })
  if (!wallet) return
  const withdrawable = withdrawableBalance(wallet)
  if (withdrawable < 0 && !wallet.negativeSince) {
    await tx.wallet.update({ where: { id: walletId }, data: { negativeSince: new Date() } })
  } else if (withdrawable >= 0 && wallet.negativeSince) {
    await tx.wallet.update({ where: { id: walletId }, data: { negativeSince: null } })
  }
}

// ==========================================================================
// Prélèvement d'une échéance d'abonnement sur le solde — arbitrages 8, 9, 10
// ==========================================================================

export type SubscriptionDebitOutcome =
  /** Prélevé : la période est réglée. */
  | { debited: true; amountFcfa: number; debitId: string }
  /** Rien n'a été prélevé, et voici pourquoi. */
  | { debited: false; reason: SubscriptionDebitRefusal; withdrawableFcfa: number }

export type SubscriptionDebitRefusal =
  /** Période introuvable, ou déjà réglée — le rejeu nocturne y passe. */
  | 'CHARGE_NOT_DUE'
  /** Aucun portefeuille : le formateur n'a jamais rien encaissé. */
  | 'NO_WALLET'
  /** Le retirable ne couvre pas le total. **Jamais de prélèvement partiel.** */
  | 'INSUFFICIENT_BALANCE'
  /** Déjà prélevée : l'unicité en base a parlé. */
  | 'ALREADY_DEBITED'

/**
 * Prélève une échéance d'abonnement sur le solde du formateur.
 *
 * **Sur le retirable, jamais sur `balance` brut.** Le solde brut contient les
 * fonds gelés par des litiges en cours (décision 8) — ils peuvent devoir être
 * rendus à un acheteur, ils ne nous appartiennent pas — et le montant d'un
 * retrait déjà demandé. Prélever dessus reviendrait à financer l'abonnement
 * avec l'argent d'un autre.
 *
 * **Tout ou rien.** Un prélèvement partiel laisserait un reliquat qu'aucun
 * mécanisme ne sait solder proprement : ni le rejeu, ni le paiement manuel, ni
 * la facture. Le montant porté est le **total** de la période — abonnement et
 * paliers de stockage ensemble (arbitrage 69), le formateur n'ayant qu'une
 * ligne à régler.
 *
 * **Idempotent par la base.** `WalletDebit.subscriptionChargeId` est unique :
 * rejouer le prélèvement de la même période est refusé en base, pas évité par
 * une lecture préalable. Le rejeu nocturne de l'arbitrage 9 repasse sur les
 * mêmes périodes chaque nuit — c'est cette contrainte qui le rend sûr.
 *
 * ⚠️ **Ne vérifie pas le consentement.** Deux appelants, deux régimes : le
 * renouvellement automatique n'appelle que si le formateur l'a activé
 * (arbitrage 8), la récupération de dette à la résiliation appelle sans le
 * demander (arbitrage 10). C'est à l'appelant de savoir dans quel cas il est.
 */
export async function debitWalletForSubscriptionCharge(
  chargeId: string,
  reason: WalletDebitReason,
): Promise<SubscriptionDebitOutcome> {
  const charge = await db.subscriptionCharge.findUnique({
    where: { id: chargeId },
    select: { id: true, trainerId: true, amountDueFcfa: true, status: true },
  })
  // Une période offerte (`WAIVED`) ou déjà réglée ne se prélève pas. Le rejeu
  // nocturne repasse dessus : ce n'est pas une anomalie, c'est le cas courant.
  if (!charge || charge.status !== 'DUE') {
    return { debited: false, reason: 'CHARGE_NOT_DUE', withdrawableFcfa: 0 }
  }

  const wallet = await db.wallet.findUnique({
    where: { trainerId: charge.trainerId },
    select: { id: true, balance: true, reservedBalance: true, pendingPayoutBalance: true },
  })
  if (!wallet) return { debited: false, reason: 'NO_WALLET', withdrawableFcfa: 0 }

  const available = withdrawableBalance(wallet)
  // Couvre du même coup le solde négatif : un retirable en dessous de zéro ne
  // peut pas atteindre un montant dû, qui est strictement positif.
  if (available < charge.amountDueFcfa) {
    return { debited: false, reason: 'INSUFFICIENT_BALANCE', withdrawableFcfa: available }
  }

  try {
    return await db.$transaction(async (tx) => {
      const debit = await tx.walletDebit.create({
        data: {
          walletId: wallet.id,
          trainerId: charge.trainerId,
          amountFcfa: charge.amountDueFcfa,
          reason,
          subscriptionChargeId: charge.id,
        },
      })

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: charge.amountDueFcfa } },
      })
      await syncNegativeSince(tx, wallet.id)

      // La période est réglée **par ce prélèvement**, dans la même transaction :
      // un solde débité sans période réglée serait de l'argent pris sans
      // contrepartie, et le rejeu de la nuit suivante recommencerait.
      await tx.subscriptionCharge.update({
        where: { id: charge.id },
        data: { status: 'SETTLED', settledAt: new Date() },
      })

      // Régler la dernière période ne solde pas un arriéré plus ancien : c'est
      // la même précaution que `settleSubscriptionCharge`.
      const stillDue = await tx.subscriptionCharge.count({
        where: { trainerId: charge.trainerId, status: 'DUE' },
      })
      // Arbitrage 12 — le règlement republie, y compris quand c'est le
      // prélèvement automatique qui l'a produit : le formateur n'a rien fait,
      // et n'a donc aucune raison de devoir republier lui-même.
      let republished = 0
      if (stillDue === 0) {
        republished = await restoreSuspendedCatalog(tx, charge.trainerId)
        await tx.trainerProfile.update({
          where: { id: charge.trainerId },
          data: { subscriptionStatus: 'ACTIVE', subscriptionPastDueAt: null, suspendedReason: null },
        })
      }

      await audit(tx, {
        actorId: null, actorRole: 'SYSTEM',
        action: 'SUBSCRIPTION_CHARGE_DEBITED', targetType: 'SubscriptionCharge', targetId: charge.id,
        meta: {
          trainerId: charge.trainerId, amountFcfa: charge.amountDueFcfa, reason,
          withdrawableBefore: available, stillDue, republished,
        },
      })

      return { debited: true, amountFcfa: charge.amountDueFcfa, debitId: debit.id } as const
    })
  } catch (err) {
    // L'unicité a refusé : cette période était déjà prélevée. Le rejeu a fait
    // son travail, ce n'est pas une erreur.
    if (String(err).includes('Unique constraint')) {
      return { debited: false, reason: 'ALREADY_DEBITED', withdrawableFcfa: available }
    }
    throw err
  }
}

export async function creditWalletOnPurchase(tx: PrismaTransaction, providerTransactionId: string, provider: PaymentProvider): Promise<CreditWalletOnPurchaseResult> {
  const result = await tx.purchase.updateMany({ where: { providerTransactionId, providerStatus: 'PENDING' }, data: { providerStatus: 'SUCCEEDED' } })
  if (result.count === 0) {
    await audit(tx, { action: 'WEBHOOK_DUPLICATE_IGNORED', meta: { provider, providerTransactionId, reason: 'purchase_already_succeeded_or_not_found' } })
    return { credited: false, purchaseId: null, trainerId: null, amountFcfa: 0, trainerShareFcfa: 0 }
  }
  const purchase = await tx.purchase.findUnique({ where: { providerTransactionId }, select: { id: true, courseId: true, trainerId: true, amountFcfa: true, trainerShareFcfa: true, platformShareFcfa: true, learnerId: true, createdAt: true } })
  if (!purchase) return { credited: false, purchaseId: null, trainerId: null, amountFcfa: 0, trainerShareFcfa: 0 }
  const walletExisted = await tx.wallet.findUnique({ where: { trainerId: purchase.trainerId }, select: { id: true } })
  await tx.wallet.upsert({ where: { trainerId: purchase.trainerId }, update: { balance: { increment: purchase.trainerShareFcfa } }, create: { trainerId: purchase.trainerId, balance: purchase.trainerShareFcfa } })
  await audit(tx, { action: 'PURCHASE_SUCCEEDED', targetType: 'Purchase', targetId: purchase.id, meta: { providerTransactionId, provider, amountFcfa: purchase.amountFcfa, trainerShareFcfa: purchase.trainerShareFcfa, platformShareFcfa: purchase.platformShareFcfa, trainerId: purchase.trainerId, learnerId: purchase.learnerId, walletAutoCreated: !walletExisted } })
  if (!walletExisted) await audit(tx, { action: 'WALLET_AUTO_CREATED', targetType: 'Wallet', targetId: purchase.trainerId, meta: { trainerId: purchase.trainerId, reason: 'wallet_missing_on_purchase_success', providerTransactionId } })
  // Un achat de communauté ouvre — ou prolonge — l'adhésion ici, dans la même
  // transaction que le crédit : le formateur encaissé et le membre entré
  // tombent ensemble, ou pas du tout. Un achat de ressource y passe sans effet.
  await activateMembershipForPurchase(tx, purchase.id)
  // Symétrique, pour l'achat de ressource : la ressource passe sous obligation
  // (arbitrage 13). Dans la même transaction que le crédit, pour la même
  // raison — une ressource payée qui ne serait pas marquée resterait comptée
  // dans le quota de son formateur, donc facturée, alors qu'il ne peut plus
  // l'effacer. La date est celle de l'achat, pas celle du webhook : c'est elle
  // que la révision recalculera (arbitrage 19).
  if (purchase.courseId) await markCourseObligation(tx, purchase.courseId, purchase.createdAt)
  return { credited: true, purchaseId: purchase.id, trainerId: purchase.trainerId, amountFcfa: purchase.amountFcfa, trainerShareFcfa: purchase.trainerShareFcfa }
}
