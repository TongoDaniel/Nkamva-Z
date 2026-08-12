// ==========================================================================
// Règlement manuel d'une échéance d'abonnement — arbitrages 11 et 12
// ==========================================================================
// Jusqu'ici, le seul geste qui levait un impayé était le « Constater » de
// `/admin/abonnements`. Le formateur recevait « votre abonnement est à régler »
// et n'avait **aucun bouton pour le régler** : il pouvait seulement attendre
// qu'un administrateur constate un virement qu'il n'avait aucun moyen de faire.
//
// Le règlement passe par `openProviderPayment`, la même porte que les achats,
// les adhésions et le premier abonnement. Aucun second chemin vers Stripe ou
// PawaPay : c'est la règle que `lib/purchases.ts` s'impose, et elle vaut ici.
//
// **L'arriéré se règle d'un bloc** : `getMySubscription` calcule déjà un
// `dueTotalFcfa` unique et le bandeau du portefeuille l'affiche ainsi. Régler
// période par période contredirait ce qui est déjà annoncé.
// ==========================================================================

import type { PaymentProvider } from '@prisma/client'
import { db } from './db'
import { audit, auditStandalone } from './audit'
import { getStripe } from './stripe'
import {
  isCheckoutSession, openProviderPayment, webBaseUrl,
  type MobileMoneyPayer, type OpenPaymentResult, type PaymentSubject,
} from './purchases'
import { deliverSideEffects, notify } from './notification'
import { restoreSuspendedCatalog } from './catalog-suspension'
import { quotePrice } from './pricing'
import { storageChargeFor } from './storage-tiers'
import { periodEndFor } from './subscriptions'
import { fmtNumber } from './format'

/** Libellé porté sur le relevé du payeur. PawaPay le borne à 22 caractères. */
const PAYMENT_LABEL = 'Abonnement NkamVa'

// ==========================================================================
// Lecture
// ==========================================================================

export interface SubscriptionPaymentState {
  /** Périodes dues, les plus anciennes d'abord. */
  chargeIds: string[]
  amountFcfa: number
  /** Vrai quand un règlement est parti et n'a pas encore de réponse finale. */
  pending: boolean
  pendingProvider: PaymentProvider | null
  /** Motif du dernier échec, tel que le fournisseur le nomme. */
  lastFailureCode: string | null
}

/**
 * Ce qu'il reste à régler, ou `null` s'il n'y a rien à payer. Une période
 * offerte (`WAIVED`) n'y figure jamais : elle n'est pas due, elle est offerte.
 */
export async function getSubscriptionPaymentState(
  trainerProfileId: string,
): Promise<SubscriptionPaymentState | null> {
  const [charges, pending, lastFailed] = await Promise.all([
    db.subscriptionCharge.findMany({
      where: { trainerId: trainerProfileId, status: 'DUE' },
      orderBy: { periodStart: 'asc' },
      select: { id: true, amountDueFcfa: true },
    }),
    db.subscriptionPayment.findFirst({
      where: { trainerId: trainerProfileId, providerStatus: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      select: { provider: true },
    }),
    db.subscriptionPayment.findFirst({
      where: { trainerId: trainerProfileId, providerStatus: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      select: { failureCode: true },
    }),
  ])

  if (charges.length === 0) return null

  return {
    chargeIds: charges.map((c) => c.id),
    amountFcfa: charges.reduce((sum, c) => sum + c.amountDueFcfa, 0),
    pending: pending !== null,
    pendingProvider: pending?.provider ?? null,
    lastFailureCode: lastFailed?.failureCode ?? null,
  }
}

// ==========================================================================
// Ouverture du règlement
// ==========================================================================

export interface InitiateSubscriptionPaymentResult {
  subscriptionPaymentId: string
  providerTransactionId: string
  redirectUrl?: string
  nextStep: OpenPaymentResult['nextStep']
}

/**
 * Ouvre le règlement des périodes dues.
 *
 * Une seule tentative vivante à la fois, comme à l'activation : un `PENDING`
 * déjà ouvert fait refuser la demande plutôt que d'en créer une seconde. Sans
 * ce garde-fou, un double clic laisserait deux paiements en vol et le formateur
 * réglerait deux fois la même période — l'un des deux ne pouvant plus
 * qu'être remboursé à la main.
 */
export async function initiateSubscriptionPayment(
  trainerProfileId: string,
  userId: string,
  provider: PaymentProvider,
  payer?: MobileMoneyPayer,
): Promise<InitiateSubscriptionPaymentResult> {
  const inFlight = await db.subscriptionPayment.findFirst({
    where: { trainerId: trainerProfileId, providerStatus: 'PENDING' },
    select: { id: true },
  })
  if (inFlight) throw new Error('PAYMENT_IN_PROGRESS')

  const state = await getSubscriptionPaymentState(trainerProfileId)
  if (!state) throw new Error('NOTHING_TO_PAY')

  // Les périodes couvertes sont **figées ici**. Un renouvellement survenu entre
  // maintenant et le retour du fournisseur ouvrira une période que ce règlement
  // ne couvre pas — et c'est exact : il n'a pas été payé pour elle.
  const payment = await db.subscriptionPayment.create({
    data: {
      trainerId: trainerProfileId,
      amountFcfa: state.amountFcfa,
      chargeIds: state.chargeIds,
      provider,
    },
  })

  const payerCountry = await db.user.findUnique({
    where: { id: userId },
    select: { countryCode: true },
  })

  let opened: OpenPaymentResult
  try {
    opened = await openProviderPayment({
      subject: subscriptionChargeSubject(payment.id),
      provider,
      amountFcfa: state.amountFcfa,
      label: PAYMENT_LABEL,
      learnerId: userId,
      countryCode: payerCountry?.countryCode ?? null,
      payer,
    })
  } catch (err) {
    // L'échec d'ouverture annule la tentative : la laisser `PENDING`
    // interdirait toute nouvelle demande par le garde-fou ci-dessus, et le
    // formateur n'aurait plus aucun moyen de régler.
    await db.subscriptionPayment.updateMany({
      where: { id: payment.id, providerStatus: 'PENDING' },
      data: {
        providerStatus: 'CANCELED',
        failureCode: err instanceof Error ? err.message : 'PAYMENT_OPEN_FAILED',
      },
    })
    await auditStandalone({
      actorId: userId, actorRole: 'TRAINER',
      action: 'SUBSCRIPTION_PAYMENT_OPEN_FAILED',
      targetType: 'SubscriptionPayment', targetId: payment.id,
      meta: { provider, reason: err instanceof Error ? err.message : 'UNKNOWN' },
    })
    throw err
  }

  await auditStandalone({
    actorId: userId, actorRole: 'TRAINER',
    action: 'SUBSCRIPTION_PAYMENT_OPENED',
    targetType: 'SubscriptionPayment', targetId: payment.id,
    meta: {
      provider, amountFcfa: state.amountFcfa,
      charges: state.chargeIds.length, nextStep: opened.nextStep,
    },
  })

  return {
    subscriptionPaymentId: payment.id,
    providerTransactionId: opened.providerTransactionId,
    redirectUrl: opened.redirectUrl,
    nextStep: opened.nextStep,
  }
}

/**
 * Ouvre une période à régler pour un formateur en état de solde — arbitrage 7.
 *
 * Il ne repasse **pas** par une candidature : son dossier reste approuvé, et le
 * réexaminer serait décourageant pour quelqu'un qu'on a déjà validé. Il règle
 * un abonnement, son espace rouvre.
 *
 * La période créée ici est une échéance ordinaire : elle se règle par le même
 * chemin que n'importe quelle autre, et c'est `settleSubscriptionPayment` qui
 * reconnaît la réactivation au statut du profil.
 */
export async function openReactivationCharge(trainerProfileId: string, now = new Date()) {
  const profile = await db.trainerProfile.findUnique({
    where: { id: trainerProfileId },
    select: { id: true, subscriptionStatus: true, subscriptionCadence: true },
  })
  if (!profile) throw new Error('TRAINER_NOT_FOUND')
  if (profile.subscriptionStatus !== 'CANCELED') throw new Error('NOT_ENDED')

  // Une période déjà ouverte : il a commencé sa réactivation et l'a abandonnée
  // en cours de route. On ne lui en ouvre pas une seconde.
  const existing = await db.subscriptionCharge.findFirst({
    where: { trainerId: trainerProfileId, status: 'DUE' },
    orderBy: { periodStart: 'asc' },
  })
  if (existing) return existing

  const cadence = profile.subscriptionCadence
  const quote = await quotePrice(cadence, { trainerId: trainerProfileId, at: now })
  const storage = await storageChargeFor(trainerProfileId, cadence, now)
  const amountDueFcfa = quote.payableFcfa + storage.amountFcfa
  if (amountDueFcfa === 0) throw new Error('NOTHING_TO_PAY')

  return db.subscriptionCharge.create({
    data: {
      trainerId: trainerProfileId,
      cadence,
      periodStart: now,
      periodEnd: periodEndFor(now, cadence),
      listPriceFcfa: quote.listPriceFcfa,
      discountFcfa: quote.discountFcfa,
      discountLabel: quote.discountLabel,
      storageTiers: storage.tiers,
      storageFcfa: storage.amountFcfa,
      amountDueFcfa,
      status: 'DUE',
    },
  })
}

/** Le sujet « échéance d'abonnement », pendant de `purchaseSubject`. */
function subscriptionChargeSubject(subscriptionPaymentId: string): PaymentSubject {
  return {
    kind: 'SUBSCRIPTION_CHARGE',
    id: subscriptionPaymentId,
    // On revient sur l'écran d'abonnement : il lit l'état réel du règlement et
    // n'affirme aucun succès de son propre chef.
    returnUrl: `${webBaseUrl()}/formateur/abonnement`,
    recordTransactionId: async (providerTransactionId) => {
      await db.subscriptionPayment.update({
        where: { id: subscriptionPaymentId },
        data: { providerTransactionId },
      })
    },
    settleSimulated: async (providerTransactionId, provider) => {
      await settleSubscriptionPayment(providerTransactionId, provider)
    },
  }
}

// ==========================================================================
// Encaissement
// ==========================================================================

export interface SettleSubscriptionPaymentResult {
  settled: boolean
  trainerId?: string
  /** Ressources remises au catalogue par ce règlement (arbitrage 12). */
  republished?: number
}

/**
 * Encaisse un règlement et solde les périodes qu'il couvre.
 *
 * **Idempotent** : un webhook rejoué ne trouve plus de ligne `PENDING` et rend
 * `settled: false` sans rien réécrire. Rend `settled: false` aussi quand
 * l'identifiant n'appartient à aucun règlement d'abonnement — c'est le cas
 * nominal pour les webhooks d'achat, qui appellent les trois chemins sans
 * savoir lequel est concerné.
 */
export async function settleSubscriptionPayment(
  providerTransactionId: string,
  provider: PaymentProvider,
): Promise<SettleSubscriptionPaymentResult> {
  const result = await db.$transaction(async (tx) => {
    const payment = await tx.subscriptionPayment.findUnique({
      where: { providerTransactionId },
      select: {
        id: true, trainerId: true, providerStatus: true,
        amountFcfa: true, chargeIds: true,
        trainerProfile: { select: { userId: true, subscriptionStatus: true } },
      },
    })
    if (!payment || payment.providerStatus !== 'PENDING') {
      return { settled: false as const }
    }

    const paidAt = new Date()
    await tx.subscriptionPayment.update({
      where: { id: payment.id },
      data: { providerStatus: 'SUCCEEDED', paidAt },
    })

    // Seules les périodes **couvertes par ce règlement** sont soldées, et
    // seulement si elles sont encore dues : un prélèvement sur solde a pu en
    // régler une entre-temps.
    const { count: settledCharges } = await tx.subscriptionCharge.updateMany({
      where: { id: { in: payment.chargeIds }, status: 'DUE' },
      data: { status: 'SETTLED', settledAt: paidAt },
    })

    // Reste-t-il une période impayée ? Une période ouverte après l'ouverture du
    // règlement n'est pas couverte, et le formateur reste alors en impayé.
    const stillDue = await tx.subscriptionCharge.count({
      where: { trainerId: payment.trainerId, status: 'DUE' },
    })

    // Arbitrage 12 — le règlement republie. Le marqueur `catalogSuspendedAt`
    // est ce qui rend la chose possible : il distingue une sortie subie d'un
    // archivage volontaire, que `status = 'archived'` confondait.
    // Arbitrage 7 — un formateur en **état de solde** qui règle ne paie pas une
    // échéance en retard : il rouvre son espace. Le statut suffit à le
    // reconnaître, aucun drapeau supplémentaire n'est nécessaire.
    const reactivation = payment.trainerProfile.subscriptionStatus === 'CANCELED'

    let republished = 0
    if (stillDue === 0) {
      if (reactivation) {
        // Ses anciennes ressources **restent archivées** : il les republie
        // lui-même. Le marqueur est effacé quand même — sans quoi un impayé
        // ultérieur les republierait toutes, y compris celles qu'il aurait
        // choisi de laisser hors catalogue.
        await tx.course.updateMany({
          where: { trainerId: payment.trainerId, catalogSuspendedAt: { not: null } },
          data: { catalogSuspendedAt: null },
        })

        // Ses pièces repassent en vérification : elles ont pu expirer ou
        // changer pendant son absence.
        await tx.payoutMethod.updateMany({
          where: { trainerId: payment.trainerId, isActive: true },
          data: { verificationStatus: 'PENDING_REVIEW' },
        })

        const period = await tx.subscriptionCharge.findFirst({
          where: { id: { in: payment.chargeIds } },
          orderBy: { periodEnd: 'desc' },
          select: { periodEnd: true },
        })

        await tx.trainerProfile.update({
          where: { id: payment.trainerId },
          data: {
            subscriptionStatus: 'ACTIVE',
            subscriptionCanceledAt: null,
            subscriptionPastDueAt: null,
            suspendedReason: null,
            ...(period ? { subscriptionCurrentPeriodEnd: period.periodEnd } : {}),
          },
        })
      } else {
        republished = await restoreSuspendedCatalog(tx, payment.trainerId)

        await tx.trainerProfile.update({
          where: { id: payment.trainerId },
          data: {
            subscriptionStatus: 'ACTIVE',
            subscriptionPastDueAt: null,
            suspendedReason: null,
          },
        })
      }
    }

    await audit(tx, {
      actorId: payment.trainerProfile.userId, actorRole: 'TRAINER',
      action: 'SUBSCRIPTION_PAYMENT_SETTLED',
      targetType: 'SubscriptionPayment', targetId: payment.id,
      meta: {
        provider, providerTransactionId, amountFcfa: payment.amountFcfa,
        settledCharges, stillDue, republished,
      },
    })

    return {
      settled: true as const,
      trainerId: payment.trainerId,
      userId: payment.trainerProfile.userId,
      amountFcfa: payment.amountFcfa,
      republished,
    }
  })

  if (!result.settled) return { settled: false }

  // L'annonce sort **après** le commit : son échec ne doit pas renvoyer
  // d'erreur au fournisseur, qui rejouerait le webhook alors que l'encaissement
  // a bien eu lieu.
  await deliverSideEffects('SUBSCRIPTION_PAYMENT_SETTLED', { type: 'SubscriptionPayment', id: result.trainerId }, () =>
    notify(result.userId, {
      type: 'SUBSCRIPTION_PAYMENT_SETTLED',
      title: 'Votre abonnement est à jour',
      body:
        `${fmtNumber(result.amountFcfa)} FCFA encaissés.` +
        (result.republished > 0
          ? ` Vos ${result.republished} ressource(s) sont de retour au catalogue.`
          : ''),
      link: '/formateur/abonnement',
    }),
  )

  return { settled: true, trainerId: result.trainerId, republished: result.republished }
}

/** Marque l'échec d'un règlement, avec le motif du fournisseur. */
export async function failSubscriptionPayment(
  providerTransactionId: string,
  failureCode: string | null,
): Promise<boolean> {
  const { count } = await db.subscriptionPayment.updateMany({
    where: { providerTransactionId, providerStatus: 'PENDING' },
    data: { providerStatus: 'FAILED', failureCode },
  })
  if (count === 0) return false

  await auditStandalone({
    actorId: null, actorRole: 'SYSTEM',
    action: 'SUBSCRIPTION_PAYMENT_FAILED',
    targetType: 'SubscriptionPayment', targetId: providerTransactionId,
    meta: { failureCode },
  })
  return true
}

/**
 * Remplace l'identifiant de session Stripe par celui du PaymentIntent.
 *
 * Même raison qu'à l'activation : la session `cs_…` est ce qu'on connaît à
 * l'ouverture, le `pi_…` est ce que porteront les événements suivants — et un
 * litige indexé sur `pi_…` ne retrouverait rien sans cette promotion.
 */
export async function promoteSubscriptionCheckoutSession(sessionId: string): Promise<string | null> {
  if (!isCheckoutSession(sessionId)) return null
  const stripe = getStripe()
  if (!stripe) return null

  const session = await stripe.checkout.sessions.retrieve(sessionId)
  if (session.payment_status !== 'paid') return null
  const intentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
  if (!intentId) return null

  const promoted = await db.subscriptionPayment.updateMany({
    where: { providerTransactionId: sessionId },
    data: { providerTransactionId: intentId },
  })
  return promoted.count > 0 ? intentId : null
}
