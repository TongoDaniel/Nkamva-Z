// ==========================================================================
// Règlement du premier abonnement — la porte d'entrée du métier de formateur
// ==========================================================================
// Décision : **on ne devient pas formateur en contractant une dette.** Une
// candidature approuvée n'ouvre plus l'espace ; elle ouvre le droit de payer.
// Le `TrainerProfile`, le portefeuille et le rôle `TRAINER` ne naissent qu'au
// retour signé du fournisseur de paiement.
//
// Ce que cela change par rapport au modèle précédent, où l'approbation créait
// le formateur et lui inscrivait une échéance `DUE` : il n'existe plus d'état
// « formateur qui n'a jamais payé ». La suspension pour impayé, elle, reste en
// place — mais elle ne concerne que les **renouvellements**, c'est-à-dire des
// formateurs qui ont déjà réglé au moins une fois.
//
// Le paiement passe par `openProviderPayment`, la même porte que les achats et
// les adhésions. Aucun second chemin vers Stripe ou PawaPay : c'est la règle
// que `lib/purchases.ts` s'impose, et elle vaut ici aussi.
// ==========================================================================

import type { PaymentProvider, PlanCadence } from '@prisma/client'
import { db } from './db'
import { audit, auditStandalone } from './audit'
import { getStripe } from './stripe'
import { issueInvoiceForSubscriptionCharge } from './invoices'
import { CADENCE_LABELS, quotePrice } from './pricing'
import {
  isCheckoutSession, openProviderPayment, providerSaysSettled, webBaseUrl,
  type MobileMoneyPayer, type OpenPaymentResult, type PaymentSubject,
} from './purchases'
import { cadenceOf, openTrainerSpace } from './trainer-applications'
import { deliverSideEffects, notify, absoluteUrl } from './notification'
import { sendEmail, renderSimpleEmail } from './email'
import { fmtFcfa } from './format'

/** Libellé porté sur le relevé du payeur. PawaPay le borne à 22 caractères. */
const PAYMENT_LABEL = 'Abonnement NKAMVA'

// ==========================================================================
// Lecture — ce que l'écran de suivi doit afficher
// ==========================================================================

export interface ActivationState {
  applicationId: string
  cadence: PlanCadence
  cadenceLabel: string
  /** Ce qu'il reste à régler pour ouvrir l'espace. */
  amountFcfa: number
  listPriceFcfa: number
  discountFcfa: number
  discountLabel: string | null
  /** Vrai quand un paiement est parti et n'a pas encore de réponse finale. */
  pending: boolean
  /** Motif du dernier échec, tel que le fournisseur le nomme. */
  lastFailureCode: string | null
  /** Page hébergée encore ouverte, s'il y en a une à reprendre. */
  pendingProvider: PaymentProvider | null
}

/**
 * L'état d'activation d'un candidat, ou `null` s'il n'y a rien à régler —
 * dossier non approuvé, espace déjà ouvert, ou abonnement gratuit.
 *
 * Le montant est **recalculé à chaque lecture** tant qu'aucun paiement n'est en
 * cours : la grille peut changer entre l'approbation et le règlement, et c'est
 * le tarif du jour qui s'applique. Dès qu'un paiement est ouvert, en revanche,
 * ce sont ses montants figés qui priment — on n'annonce pas un prix différent
 * de celui qui part chez le fournisseur.
 */
export async function getActivationState(userId: string): Promise<ActivationState | null> {
  const profile = await db.trainerProfile.findUnique({ where: { userId }, select: { id: true } })
  if (profile) return null

  const application = await db.trainerApplication.findFirst({
    where: { userId, status: 'APPROVED' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, desiredCadence: true },
  })
  if (!application) return null

  const cadence = cadenceOf(application)
  const [pending, lastFailed] = await Promise.all([
    db.trainerActivationPayment.findFirst({
      where: { applicationId: application.id, providerStatus: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    }),
    db.trainerActivationPayment.findFirst({
      where: { applicationId: application.id, providerStatus: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      select: { failureCode: true },
    }),
  ])

  const quote = pending
    ? {
        listPriceFcfa: pending.listPriceFcfa,
        discountFcfa: pending.discountFcfa,
        discountLabel: pending.discountLabel,
        payableFcfa: pending.amountFcfa,
      }
    : await quotePrice(cadence)

  // Un abonnement à zéro n'a rien à régler. Le cas n'est pas théorique : c'est
  // celui de l'annuelle pendant la gratuité de lancement. Il ne devrait pas
  // arriver ici — `approveApplication` ouvre alors l'espace directement — mais
  // une grille passée à zéro après coup l'y amènerait.
  if (quote.payableFcfa === 0) return null

  return {
    applicationId: application.id,
    cadence,
    cadenceLabel: CADENCE_LABELS[cadence],
    amountFcfa: quote.payableFcfa,
    listPriceFcfa: quote.listPriceFcfa,
    discountFcfa: quote.discountFcfa,
    discountLabel: quote.discountLabel,
    pending: pending !== null,
    lastFailureCode: lastFailed?.failureCode ?? null,
    pendingProvider: pending?.provider ?? null,
  }
}

// ==========================================================================
// Ouverture du paiement
// ==========================================================================

export interface InitiateActivationResult {
  activationPaymentId: string
  providerTransactionId: string
  redirectUrl?: string
  nextStep: OpenPaymentResult['nextStep']
}

/**
 * Ouvre le règlement du premier abonnement.
 *
 * Une seule tentative vivante à la fois : un `PENDING` déjà ouvert fait refuser
 * la demande plutôt que d'en créer une seconde. Sans ce garde-fou, un double
 * clic laisserait deux dépôts en vol et le candidat paierait deux fois son
 * ouverture d'espace — l'un des deux ne pouvant plus qu'être remboursé à la
 * main.
 */
export async function initiateActivationPayment(
  userId: string,
  provider: PaymentProvider,
  payer?: MobileMoneyPayer,
): Promise<InitiateActivationResult> {
  const existingProfile = await db.trainerProfile.findUnique({
    where: { userId },
    select: { id: true },
  })
  if (existingProfile) throw new Error('ALREADY_TRAINER')

  const application = await db.trainerApplication.findFirst({
    where: { userId, status: 'APPROVED' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, desiredCadence: true },
  })
  if (!application) throw new Error('APPLICATION_NOT_APPROVED')

  const inFlight = await db.trainerActivationPayment.findFirst({
    where: { applicationId: application.id, providerStatus: 'PENDING' },
    select: { id: true },
  })
  if (inFlight) throw new Error('PAYMENT_IN_PROGRESS')

  const cadence = cadenceOf(application)
  const quote = await quotePrice(cadence)
  // Rien à payer : il n'y a pas de paiement à ouvrir, l'espace s'ouvre. Le
  // chemin existe pour la grille qui tomberait à zéro après une approbation
  // payante — le candidat ne doit pas rester bloqué devant un montant nul.
  if (quote.payableFcfa === 0) {
    await db.$transaction((tx) =>
      openTrainerSpace(tx, application.id, {
        listPriceFcfa: quote.listPriceFcfa,
        discountFcfa: quote.discountFcfa,
        discountLabel: quote.discountLabel,
        amountFcfa: 0,
        paidAt: new Date(),
      }),
    )
    throw new Error('NOTHING_TO_PAY')
  }

  // Les montants sont figés ici (décision 57) : c'est ce qui part chez le
  // fournisseur, et ce sera la première période du formateur.
  const payment = await db.trainerActivationPayment.create({
    data: {
      applicationId: application.id,
      cadence,
      listPriceFcfa: quote.listPriceFcfa,
      discountFcfa: quote.discountFcfa,
      discountLabel: quote.discountLabel,
      amountFcfa: quote.payableFcfa,
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
      subject: activationSubject(payment.id),
      provider,
      amountFcfa: quote.payableFcfa,
      label: PAYMENT_LABEL,
      learnerId: userId,
      countryCode: payerCountry?.countryCode ?? null,
      payer,
    })
  } catch (err) {
    // L'échec d'ouverture annule la tentative : la laisser PENDING
    // interdirait toute nouvelle demande par le garde-fou ci-dessus, et le
    // candidat n'aurait plus aucun moyen d'ouvrir son espace.
    await db.trainerActivationPayment.updateMany({
      where: { id: payment.id, providerStatus: 'PENDING' },
      data: {
        providerStatus: 'CANCELED',
        failureCode: err instanceof Error ? err.message : 'PAYMENT_OPEN_FAILED',
      },
    })
    await auditStandalone({
      actorId: userId, actorRole: 'PENDING_TRAINER',
      action: 'TRAINER_ACTIVATION_OPEN_FAILED',
      targetType: 'TrainerActivationPayment', targetId: payment.id,
      meta: { provider, reason: err instanceof Error ? err.message : 'UNKNOWN' },
    })
    throw err
  }

  await auditStandalone({
    actorId: userId, actorRole: 'PENDING_TRAINER',
    action: 'TRAINER_ACTIVATION_OPENED',
    targetType: 'TrainerActivationPayment', targetId: payment.id,
    meta: { provider, cadence, amountFcfa: quote.payableFcfa, nextStep: opened.nextStep },
  })

  return {
    activationPaymentId: payment.id,
    providerTransactionId: opened.providerTransactionId,
    redirectUrl: opened.redirectUrl,
    nextStep: opened.nextStep,
  }
}

/** Le sujet « activation », pendant de `purchaseSubject`. */
function activationSubject(activationPaymentId: string): PaymentSubject {
  return {
    kind: 'TRAINER_ACTIVATION',
    id: activationPaymentId,
    // On revient au suivi de candidature : il lit l'état réel du règlement et
    // n'affirme aucun succès de son propre chef.
    returnUrl: `${webBaseUrl()}/candidature/statut`,
    recordTransactionId: async (providerTransactionId) => {
      await db.trainerActivationPayment.update({
        where: { id: activationPaymentId },
        data: { providerTransactionId },
      })
    },
    settleSimulated: async (providerTransactionId, provider) => {
      await settleActivationPayment(providerTransactionId, provider)
    },
  }
}

// ==========================================================================
// Règlement — appelé par les webhooks signés, et par eux seuls
// ==========================================================================

export interface SettleActivationResult {
  settled: boolean
  trainerProfileId?: string
}

/**
 * Encaisse un règlement d'activation et ouvre l'espace dans la même
 * transaction. **Idempotent** : un webhook rejoué ne trouve plus de ligne
 * `PENDING` et rend `settled: false` sans rien réécrire.
 *
 * Rend `settled: false` aussi quand l'identifiant n'appartient à aucune
 * activation — c'est le cas nominal pour les webhooks d'achat, qui appellent
 * les deux chemins sans savoir lequel est concerné.
 */
export async function settleActivationPayment(
  providerTransactionId: string,
  provider: PaymentProvider,
): Promise<SettleActivationResult> {
  const result = await db.$transaction(async (tx) => {
    const payment = await tx.trainerActivationPayment.findUnique({
      where: { providerTransactionId },
      select: {
        id: true, applicationId: true, providerStatus: true, amountFcfa: true,
        listPriceFcfa: true, discountFcfa: true, discountLabel: true,
        application: { select: { userId: true } },
      },
    })
    if (!payment || payment.providerStatus !== 'PENDING') {
      return { settled: false as const }
    }

    const paidAt = new Date()
    await tx.trainerActivationPayment.update({
      where: { id: payment.id },
      data: { providerStatus: 'SUCCEEDED', paidAt },
    })

    // L'espace naît ici, dans la transaction du règlement : un paiement
    // encaissé sans espace ouvert — ou l'inverse — serait invisible longtemps.
    const profile = await openTrainerSpace(tx, payment.applicationId, {
      listPriceFcfa: payment.listPriceFcfa,
      discountFcfa: payment.discountFcfa,
      discountLabel: payment.discountLabel,
      amountFcfa: payment.amountFcfa,
      paidAt,
    })

    await audit(tx, {
      actorId: payment.application.userId, actorRole: 'PENDING_TRAINER',
      action: 'TRAINER_ACTIVATION_SETTLED',
      targetType: 'TrainerActivationPayment', targetId: payment.id,
      meta: {
        provider, providerTransactionId, amountFcfa: payment.amountFcfa,
        trainerProfileId: profile.id,
      },
    })

    return {
      settled: true as const,
      trainerProfileId: profile.id,
      userId: payment.application.userId,
    }
  })

  if (!result.settled) return { settled: false }

  // La facture et l'annonce sortent **après** le commit : leur échec ne doit
  // pas renvoyer d'erreur au fournisseur, qui rejouerait le webhook alors que
  // l'espace est déjà ouvert.
  const charge = await db.subscriptionCharge.findFirst({
    where: { trainerId: result.trainerProfileId },
    orderBy: { periodStart: 'asc' },
    select: { id: true },
  })
  if (charge) {
    try {
      await issueInvoiceForSubscriptionCharge(charge.id)
    } catch (err) {
      await auditStandalone({
        action: 'INVOICE_ISSUE_FAILED', targetType: 'SubscriptionCharge', targetId: charge.id,
        meta: { reason: err instanceof Error ? err.message : 'UNKNOWN' },
      })
    }
  }

  await deliverSideEffects(
    'TRAINER_SPACE_OPENED',
    { type: 'TrainerProfile', id: result.trainerProfileId },
    async () => {
      const user = await db.user.findUnique({
        where: { id: result.userId },
        select: { email: true },
      })
      await notify(result.userId, {
        type: 'TRAINER_APPLICATION_APPROVED',
        title: 'Votre espace formateur est ouvert',
        body: 'Votre abonnement est réglé. Vous pouvez publier vos premières ressources.',
        link: '/formateur',
      })
      if (!user?.email) return
      await sendEmail({
        to: user.email,
        subject: 'NKAMVA · Votre espace formateur est ouvert',
        ...renderSimpleEmail({
          title: 'Votre espace formateur est ouvert',
          paragraphs: [
            'Nous avons bien reçu le règlement de votre abonnement.',
            'Votre espace est ouvert : vous pouvez publier vos ressources, animer votre communauté et programmer vos sessions.',
          ],
          cta: { label: 'Accéder à mon espace', url: absoluteUrl('/formateur') },
        }),
        tags: ['trainer-space-opened'],
      })
    },
  )

  return { settled: true, trainerProfileId: result.trainerProfileId }
}

/**
 * Redemande au fournisseur ce qu'il est advenu d'un règlement en attente, et
 * en tire les conséquences.
 *
 * **Sans cette fonction, un candidat reste bloqué pour toujours.** Le webhook
 * est la voie nominale, mais il peut se perdre — et en développement il
 * n'atteint jamais `localhost`, si bien qu'un paiement par carte parfaitement
 * abouti chez Stripe laissait l'écran sur « en attente » indéfiniment. C'est
 * exactement le défaut que `reconcilePurchase` avait déjà eu à corriger pour
 * les achats ; il n'y avait aucune raison de le refaire ici.
 *
 * Le fournisseur reste seul juge : on lui redemande le statut, on ne le déduit
 * jamais du fait que le candidat soit revenu sur la page.
 */
export async function reconcileActivationPayment(userId: string): Promise<boolean> {
  const application = await db.trainerApplication.findFirst({
    where: { userId, status: 'APPROVED' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  if (!application) return false

  const pending = await db.trainerActivationPayment.findFirst({
    where: { applicationId: application.id, providerStatus: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, provider: true, providerTransactionId: true },
  })
  // Sans identifiant, le fournisseur n'a rien ouvert : il n'y a rien à lui
  // demander.
  if (!pending?.providerTransactionId) return false

  const verdict = await providerSaysSettled(pending.provider, pending.providerTransactionId)

  if (verdict.outcome === 'FAILED') {
    await failActivationPayment(
      pending.providerTransactionId,
      verdict.failureCode ?? 'UNSPECIFIED_FAILURE',
    )
    return false
  }
  if (verdict.outcome !== 'COMPLETED') return false

  // Une session Checkout payée cède la place à son PaymentIntent avant tout
  // encaissement : c'est sous ce numéro que le règlement devra être retrouvé.
  const settledId = isCheckoutSession(pending.providerTransactionId)
    ? await promoteActivationCheckoutSession(pending.providerTransactionId)
    : pending.providerTransactionId
  if (!settledId) return false

  // Écriture idempotente, comme le webhook : si celui-ci arrive entre-temps,
  // l'un des deux ne trouve plus de tentative en attente et n'écrit rien.
  const settled = await settleActivationPayment(settledId, pending.provider)
  if (settled.settled) {
    await auditStandalone({
      actorId: userId, actorRole: 'PENDING_TRAINER',
      action: 'TRAINER_ACTIVATION_RECONCILED',
      targetType: 'TrainerActivationPayment', targetId: pending.id,
      meta: {
        provider: pending.provider,
        openedWith: pending.providerTransactionId,
        settledWith: settledId,
      },
    })
  }
  return settled.settled
}

/**
 * Marque une tentative en échec. Le motif est porté par la ligne et pas
 * seulement par le journal : sans lui, l'écran ne peut dire que « l'opérateur a
 * refusé », là où le candidat a besoin de savoir s'il doit recharger son compte
 * ou approuver la demande sur son téléphone.
 */
export async function failActivationPayment(
  providerTransactionId: string,
  failureCode: string,
): Promise<boolean> {
  const failed = await db.trainerActivationPayment.updateMany({
    where: { providerTransactionId, providerStatus: 'PENDING' },
    data: { providerStatus: 'FAILED', failureCode },
  })
  return failed.count > 0
}

/**
 * Remplace le `cs_…` d'une activation par le `pi_…` de son paiement, une fois
 * la session Checkout aboutie — même charnière que `promoteCheckoutSession`
 * pour les achats, et pour la même raison : tout l'aval Stripe est indexé sur
 * le PaymentIntent, qui n'existe pas encore à l'ouverture de la session.
 */
export async function promoteActivationCheckoutSession(sessionId: string): Promise<string | null> {
  if (!isCheckoutSession(sessionId)) return null
  const stripe = getStripe()
  if (!stripe) return null

  const session = await stripe.checkout.sessions.retrieve(sessionId)
  if (session.payment_status !== 'paid') return null
  const intentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
  if (!intentId) return null

  const promoted = await db.trainerActivationPayment.updateMany({
    where: { providerTransactionId: sessionId },
    data: { providerTransactionId: intentId },
  })
  return promoted.count > 0 ? intentId : null
}

/** Message affichable d'un montant d'activation, pour les écrans et les mails. */
export function activationSummary(state: ActivationState): string {
  return `${state.cadenceLabel} · ${fmtFcfa(state.amountFcfa)}`
}
