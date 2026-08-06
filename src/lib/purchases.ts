// ==========================================================================
// Lot 4 — Achat : ouverture du paiement (Stripe / PawaPay), réconciliation
// ==========================================================================
// **Ce module n'a plus de mode « simulé implicite ».**
//
// Il en avait un, et c'était le défaut le plus grave de la plateforme :
// `initiatePurchase` créditait l'achat sans aucun paiement dès que
// `STRIPE_SECRET_KEY` ou `CINETPAY_API_KEY` manquait. La condition portait sur
// la présence d'une clé, jamais sur l'environnement — un déploiement qui
// recopiait `.env.example` (où ces variables sont vides) ouvrait donc tout le
// catalogue gratuitement, et créditait au passage les portefeuilles formateurs
// d'un argent jamais encaissé, retirable ensuite.
//
// Le raccourci de développement existe toujours, mais il exige désormais DEUX
// conditions explicites et ne peut pas être atteint en production. Voir
// `simulationAllowed()`.
// ==========================================================================

import type { MobileMoneyOperator, PaymentProvider, PaymentStatus } from '@prisma/client'
import { db } from './db'
import { auditStandalone } from './audit'
import { assertCanActAsLearner } from './roles'
import { creditWalletOnPurchase } from './wallet'
import { issueInvoiceQuietly } from './invoices'
import { getStripe } from './stripe'
import {
  assertOperational, checkDeposit, isPawaPayConfigured, pawapayCountry,
  pawapayProviderCode, requestDeposit, toMsisdn, PawaPayError,
} from './pawapay'

/**
 * Devise à zéro décimale, chez Stripe comme chez PawaPay : `amountFcfa` part
 * tel quel, sans multiplication par cent. Multiplier ici facturerait cent fois
 * le prix affiché.
 */
export const PAYMENT_CURRENCY = 'XAF'

/**
 * Le raccourci de développement. **Deux verrous, et non un** :
 *
 *  1. `NODE_ENV !== 'production'` — infranchissable sur un déploiement réel ;
 *  2. `ALLOW_PAYMENT_SIMULATION=1` — un geste explicite, pas un oubli.
 *
 * L'ancienne version se déclenchait sur l'ABSENCE d'une variable. C'est
 * l'inverse de ce qu'il faut : une configuration incomplète doit refuser de
 * fonctionner, jamais s'autoriser davantage.
 */
function simulationAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ALLOW_PAYMENT_SIMULATION === '1'
}

export interface MobileMoneyPayer {
  /** Numéro tel que saisi par l'apprenant ; normalisé en MSISDN plus bas. */
  phoneNumber: string
  operator: MobileMoneyOperator
}

export interface OpenPaymentParams {
  purchaseId: string
  provider: PaymentProvider
  amountFcfa: number
  /** Libellé porté sur le relevé du client (4 à 22 caractères chez PawaPay). */
  label: string
  learnerId: string
  countryCode: string | null
  /** Obligatoire pour PawaPay : le mobile money désigne un numéro, pas un compte. */
  payer?: MobileMoneyPayer
}

export interface OpenPaymentResult {
  providerTransactionId: string
  /** Stripe : à remettre au composant de paiement côté navigateur. */
  clientSecret?: string
  /** Ce que l'écran doit demander à l'apprenant ensuite. */
  nextStep: 'CONFIRM_ON_PHONE' | 'CONFIRM_CARD' | 'ALREADY_SETTLED'
}

/**
 * Ouvre le paiement chez le fournisseur et rend de quoi le conclure côté
 * client. **Seul endroit** où un paiement est ouvert : `initiatePurchase` et
 * `initiateMembershipPayment` passent tous deux par ici, sans quoi le
 * correctif ci-dessus n'aurait tenu que sur la moitié des tunnels.
 *
 * Ne passe jamais l'achat en `SUCCEEDED` : c'est le callback signé du
 * fournisseur, et lui seul, qui le fait.
 */
export async function openProviderPayment(params: OpenPaymentParams): Promise<OpenPaymentResult> {
  if (params.provider === 'PAWAPAY') return openPawaPayDeposit(params)
  return openStripePaymentIntent(params)
}

async function openPawaPayDeposit(params: OpenPaymentParams): Promise<OpenPaymentResult> {
  if (!isPawaPayConfigured()) {
    if (simulationAllowed()) return settleWithoutProvider(params, 'PAWAPAY')
    throw new Error('PAYMENT_PROVIDER_UNAVAILABLE')
  }
  if (!params.payer) throw new Error('MOBILE_MONEY_DETAILS_REQUIRED')

  const country = params.countryCode ?? 'CM'
  const providerCode = pawapayProviderCode(params.payer.operator, country)
  if (!providerCode) throw new Error('PROVIDER_NOT_SUPPORTED')

  // Bornes et disponibilité lues sur `/v2/active-conf` : un montant hors
  // limites ou un opérateur fermé se refuse ici, avec un motif lisible, plutôt
  // que de partir se faire rejeter et laisser un achat en attente.
  const capability = await assertOperational(providerCode, 'DEPOSIT', params.amountFcfa)

  // L'identifiant est le nôtre, et il fait office de clé d'idempotence chez
  // PawaPay : le rejouer est sans effet. Un UUID nu, sans préfixe — le format
  // est contraint.
  const depositId = crypto.randomUUID()
  const phoneNumber = toMsisdn(params.payer.phoneNumber, capability.prefix)

  const response = await requestDeposit({
    depositId,
    phoneNumber,
    provider: providerCode,
    amountFcfa: params.amountFcfa,
    customerMessage: params.label,
    clientReferenceId: params.purchaseId,
    metadata: { purchaseId: params.purchaseId, learnerId: params.learnerId },
  })

  if (response.status === 'REJECTED') {
    await auditStandalone({
      action: 'PAYMENT_REJECTED', targetType: 'Purchase', targetId: params.purchaseId,
      meta: {
        provider: 'PAWAPAY', depositId,
        failureCode: response.failureReason?.failureCode ?? null,
        failureMessage: response.failureReason?.failureMessage ?? null,
      },
    })
    throw new Error(response.failureReason?.failureCode || 'PAYMENT_REJECTED')
  }

  await db.purchase.update({
    where: { id: params.purchaseId },
    data: { providerTransactionId: depositId },
  })

  return { providerTransactionId: depositId, nextStep: 'CONFIRM_ON_PHONE' }
}

async function openStripePaymentIntent(params: OpenPaymentParams): Promise<OpenPaymentResult> {
  const stripe = getStripe()
  if (!stripe) {
    if (simulationAllowed()) return settleWithoutProvider(params, 'STRIPE')
    throw new Error('PAYMENT_PROVIDER_UNAVAILABLE')
  }

  // L'identifiant vient de Stripe, il ne s'invente pas : la version précédente
  // fabriquait un faux `pi_<uuid>` que Stripe n'a jamais connu, si bien qu'aucun
  // webhook réel n'aurait pu être rapproché de l'achat.
  const intent = await stripe.paymentIntents.create(
    {
      amount: params.amountFcfa,
      currency: PAYMENT_CURRENCY.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: { purchaseId: params.purchaseId, learnerId: params.learnerId },
      description: params.label,
    },
    { idempotencyKey: `purchase_${params.purchaseId}` },
  )

  await db.purchase.update({
    where: { id: params.purchaseId },
    data: { providerTransactionId: intent.id },
  })

  return {
    providerTransactionId: intent.id,
    clientSecret: intent.client_secret ?? undefined,
    nextStep: 'CONFIRM_CARD',
  }
}

/**
 * Raccourci de développement, atteignable uniquement sous les deux verrous de
 * `simulationAllowed()`. Il crédite directement, sans passer par un faux
 * webhook : les callbacks exigent désormais une signature du fournisseur qu'on
 * ne saurait pas contrefaire — et c'est très bien ainsi.
 */
async function settleWithoutProvider(
  params: OpenPaymentParams,
  provider: PaymentProvider,
): Promise<OpenPaymentResult> {
  const providerTransactionId = crypto.randomUUID()
  await db.purchase.update({
    where: { id: params.purchaseId },
    data: { providerTransactionId },
  })
  await auditStandalone({
    action: 'PAYMENT_SIMULATED', targetType: 'Purchase', targetId: params.purchaseId,
    meta: { provider, providerTransactionId, reason: 'ALLOW_PAYMENT_SIMULATION' },
  })
  const credit = await db.$transaction((tx) => creditWalletOnPurchase(tx, providerTransactionId, provider))
  if (credit.credited && credit.purchaseId) await issueInvoiceQuietly(credit.purchaseId)
  return { providerTransactionId, nextStep: 'ALREADY_SETTLED' }
}

export interface InitiatePurchaseResult {
  purchaseId: string
  providerTransactionId: string
  clientSecret?: string  // Stripe PaymentIntent client_secret
  provider: PaymentProvider
  /** Ce que l'écran doit demander ensuite : le téléphone, la carte, ou rien. */
  nextStep: OpenPaymentResult['nextStep']
}

// --- Initier un achat ---

export async function initiatePurchase(
  courseId: string,
  learnerId: string,
  provider: PaymentProvider,
  payer?: MobileMoneyPayer,
): Promise<InitiatePurchaseResult> {
  // Avant toute chose, et avant tout appel au fournisseur de paiement : un
  // compte d'administration n'achète pas. Le journal d'audit de cette fonction
  // écrit `actorRole: 'LEARNER'` en dur — il le SUPPOSAIT sans le vérifier.
  await assertCanActAsLearner(learnerId)

  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      trainerProfile: {
        select: { id: true, commissionRate: true },
      },
    },
  })

  if (!course) throw new Error('COURSE_NOT_FOUND')
  if (course.status !== 'published') throw new Error('COURSE_NOT_AVAILABLE')
  // Arbitrage 47 — circuits exclusifs. Elle s'obtient par l'abonnement à la
  // communauté, pas à l'unité.
  if (course.circuit === 'COMMUNITY') throw new Error('COURSE_NOT_FOR_SALE')

  const learner = await db.user.findUnique({
    where: { id: learnerId },
    select: { countryCode: true },
  })

  // Vérifier si l'apprenant a déjà acheté
  const existing = await db.purchase.findFirst({
    where: {
      learnerId,
      courseId,
      providerStatus: { in: ['SUCCEEDED', 'PENDING'] },
    },
  })
  if (existing?.providerStatus === 'SUCCEEDED') throw new Error('ALREADY_PURCHASED')
  if (existing?.providerStatus === 'PENDING') {
    // Un achat en attente qui porte déjà son identifiant fournisseur se reprend
    // tel quel. S'il n'en a pas, c'est que l'ouverture du paiement a échoué
    // après la création de la ligne : on la rouvre plutôt que de laisser
    // l'apprenant bloqué sur un achat qu'aucun callback ne viendra conclure.
    if (existing.providerTransactionId) {
      return {
        purchaseId: existing.id,
        providerTransactionId: existing.providerTransactionId,
        provider: existing.provider,
        nextStep: existing.provider === 'PAWAPAY' ? 'CONFIRM_ON_PHONE' : 'CONFIRM_CARD',
      }
    }
    const reopened = await openProviderPayment({
      purchaseId: existing.id,
      provider,
      amountFcfa: existing.amountFcfa,
      label: course.title,
      learnerId,
      countryCode: learner?.countryCode ?? null,
      payer,
    })
    return {
      purchaseId: existing.id,
      providerTransactionId: reopened.providerTransactionId,
      clientSecret: reopened.clientSecret,
      provider,
      nextStep: reopened.nextStep,
    }
  }

  const amountFcfa = course.priceFcfa
  const commissionRate = course.trainerProfile.commissionRate
  const trainerShareFcfa = Math.round(amountFcfa * (1 - commissionRate))
  const platformShareFcfa = amountFcfa - trainerShareFcfa

  // Le contrôle d'achat existant ci-dessus lit avant d'écrire : deux requêtes
  // simultanées voyaient toutes deux « aucun achat » et inséraient chacune la
  // leur. L'apprenant était débité deux fois et le formateur crédité deux fois —
  // chaque achat portant son propre `providerTransactionId`, l'idempotence de
  // `creditWalletOnPurchase` ne rattrapait rien. Reproduit 2 fois sur 6.
  // C'est désormais l'index unique partiel `purchases_active_course_unique` qui
  // tranche, en base : le perdant de la course retombe sur l'achat du gagnant.
  // L'achat naît **sans** identifiant fournisseur : c'est l'ouverture du
  // paiement qui le pose, parce que Stripe seul décide de l'identifiant de son
  // PaymentIntent. L'ancienne version en fabriquait un (`pi_<uuid>`) que Stripe
  // n'a jamais connu — aucun webhook réel n'aurait pu être rapproché.
  let purchase
  try {
    purchase = await db.purchase.create({
      data: {
        learnerId,
        trainerId: course.trainerProfile.id,
        courseId,
        amountFcfa,
        commissionRate,
        trainerShareFcfa,
        platformShareFcfa,
        provider,
        providerStatus: 'PENDING',
      },
    })
  } catch (err: any) {
    if (err?.code !== 'P2002') throw err

    const winner = await db.purchase.findFirst({
      where: { learnerId, courseId, providerStatus: { in: ['SUCCEEDED', 'PENDING'] } },
    })
    if (!winner) throw err
    if (winner.providerStatus === 'SUCCEEDED') throw new Error('ALREADY_PURCHASED')
    if (!winner.providerTransactionId) throw new Error('PAYMENT_IN_PROGRESS')
    return {
      purchaseId: winner.id,
      providerTransactionId: winner.providerTransactionId,
      provider: winner.provider,
      nextStep: winner.provider === 'PAWAPAY' ? 'CONFIRM_ON_PHONE' : 'CONFIRM_CARD',
    }
  }

  await auditStandalone({
    actorId: learnerId, actorRole: 'LEARNER',
    action: 'PURCHASE_INITIATED', targetType: 'Purchase', targetId: purchase.id,
    meta: { courseId, amountFcfa, provider },
  })

  // L'échec d'ouverture annule l'achat : le laisser en attente le rendrait
  // irréparable — l'index unique partiel interdirait toute nouvelle tentative
  // sur la même ressource tant qu'il vit.
  let opened: OpenPaymentResult
  try {
    opened = await openProviderPayment({
      purchaseId: purchase.id,
      provider,
      amountFcfa,
      label: course.title,
      learnerId,
      countryCode: learner?.countryCode ?? null,
      payer,
    })
  } catch (err) {
    await db.purchase.updateMany({
      where: { id: purchase.id, providerStatus: 'PENDING' },
      data: { providerStatus: 'CANCELED' },
    })
    await auditStandalone({
      actorId: learnerId, actorRole: 'LEARNER',
      action: 'PURCHASE_OPEN_FAILED', targetType: 'Purchase', targetId: purchase.id,
      meta: { provider, error: err instanceof Error ? err.message : String(err) },
    })
    throw err
  }

  return {
    purchaseId: purchase.id,
    providerTransactionId: opened.providerTransactionId,
    clientSecret: opened.clientSecret,
    provider,
    nextStep: opened.nextStep,
  }
}

// --- Réconciliation par polling (cas webhook tardif) ---

export async function reconcilePurchase(providerTransactionId: string): Promise<{ status: string; credited: boolean }> {
  const purchase = await db.purchase.findUnique({
    where: { providerTransactionId },
    select: { id: true, providerStatus: true, provider: true },
  })

  if (!purchase) return { status: 'NOT_FOUND', credited: false }
  if (purchase.providerStatus === 'SUCCEEDED') return { status: 'SUCCEEDED', credited: false }

  // Cette fonction était une coquille vide : elle décrivait en commentaire ce
  // qu'il aurait fallu faire et rendait toujours « rien à signaler ». La route
  // qui l'appelle après un paiement laissait donc l'apprenant devant un écran
  // d'attente qu'aucun événement ne débloquait si le callback se perdait.
  //
  // Le fournisseur reste seul juge : on lui redemande le statut, on ne le
  // déduit jamais du fait que le client soit revenu sur la page.
  const settled = await providerSaysSettled(purchase.provider, providerTransactionId)

  if (settled === 'FAILED') {
    await db.purchase.updateMany({
      where: { id: purchase.id, providerStatus: 'PENDING' },
      data: { providerStatus: 'FAILED' },
    })
    return { status: 'FAILED', credited: false }
  }

  if (settled !== 'COMPLETED') return { status: purchase.providerStatus, credited: false }

  // Même écriture idempotente que le callback : si celui-ci arrive entre-temps,
  // l'un des deux voit `count === 0` et n'écrit rien.
  const credit = await db.$transaction((tx) =>
    creditWalletOnPurchase(tx, providerTransactionId, purchase.provider),
  )
  if (credit.credited && credit.purchaseId) {
    await issueInvoiceQuietly(credit.purchaseId)
    await auditStandalone({
      action: 'PURCHASE_RECONCILED', targetType: 'Purchase', targetId: purchase.id,
      meta: { provider: purchase.provider, providerTransactionId },
    })
  }
  return { status: 'SUCCEEDED', credited: credit.credited }
}

/** Interroge le fournisseur. `null` quand le paiement n'est pas encore tranché. */
async function providerSaysSettled(
  provider: PaymentProvider,
  providerTransactionId: string,
): Promise<'COMPLETED' | 'FAILED' | null> {
  try {
    if (provider === 'PAWAPAY') {
      if (!isPawaPayConfigured()) return null
      const snapshot = await checkDeposit(providerTransactionId)
      if (!snapshot) return null
      if (snapshot.status === 'COMPLETED') return 'COMPLETED'
      return snapshot.status === 'FAILED' ? 'FAILED' : null
    }

    const stripe = getStripe()
    if (!stripe) return null
    const intent = await stripe.paymentIntents.retrieve(providerTransactionId)
    if (intent.status === 'succeeded') return 'COMPLETED'
    return intent.status === 'canceled' ? 'FAILED' : null
  } catch (err) {
    // Une panne de réconciliation n'est pas une panne de paiement : on laisse
    // l'achat en attente, le callback reste la voie normale.
    console.error('[PAYMENT:RECONCILE_FAILED]', {
      provider, providerTransactionId,
      error: err instanceof PawaPayError ? err.message : String(err),
    })
    return null
  }
}

// --- Lister les achats d'un apprenant ---

export async function listMyPurchases(learnerId: string, page: number, pageSize: number) {
  const [items, total] = await Promise.all([
    db.purchase.findMany({
      where: { learnerId },
      include: {
        course: {
          select: { id: true, title: true, slug: true, format: true, coverS3Key: true, durationSeconds: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.purchase.count({ where: { learnerId } }),
  ])

  return { items, total, page, pageSize }
}

// --- Chiffres de tête de la page « Mes achats » ---

// ==========================================================================
// Lecture Finances — registre des transactions
// ==========================================================================
// `Purchase` est la source de vérité : les parts y sont snapshotées à la vente
// (décision 11), donc un changement de taux de commission ne réécrit jamais le
// passé. Ce registre ne recalcule rien, il lit ce qui a été figé.

export async function listAllPurchases(filters: {
  providerStatus?: PaymentStatus
  refunded?: boolean
  page?: number
  pageSize?: number
}) {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(filters.pageSize ?? 20, 50)

  const where = {
    ...(filters.providerStatus ? { providerStatus: filters.providerStatus } : {}),
    ...(filters.refunded === true ? { refundedAt: { not: null } } : {}),
    ...(filters.refunded === false ? { refundedAt: null } : {}),
  }

  const [items, total] = await Promise.all([
    db.purchase.findMany({
      where,
      include: {
        learner: { select: { id: true, email: true, fullName: true } },
        course: { select: { id: true, title: true, slug: true } },
        community: { select: { id: true, name: true } },
        trainerProfile: { select: { id: true, user: { select: { email: true, fullName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.purchase.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function getPurchaseStats() {
  const SETTLED = { providerStatus: 'SUCCEEDED', refundedAt: null } as const

  const [byStatus, settled, refunded] = await Promise.all([
    db.purchase.groupBy({ by: ['providerStatus'], _count: { _all: true } }),
    db.purchase.aggregate({
      where: SETTLED,
      _count: { _all: true },
      _sum: { amountFcfa: true, platformShareFcfa: true, trainerShareFcfa: true },
    }),
    db.purchase.aggregate({
      where: { refundedAt: { not: null } },
      _count: { _all: true },
      _sum: { amountFcfa: true },
    }),
  ])

  const counts = Object.fromEntries(byStatus.map(r => [r.providerStatus, r._count._all]))
  return {
    byStatus: counts,
    pending: counts.PENDING ?? 0,
    failed: counts.FAILED ?? 0,
    settledCount: settled._count._all,
    grossFcfa: settled._sum.amountFcfa ?? 0,
    platformShareFcfa: settled._sum.platformShareFcfa ?? 0,
    trainerShareFcfa: settled._sum.trainerShareFcfa ?? 0,
    refundedCount: refunded._count._all,
    refundedFcfa: refunded._sum.amountFcfa ?? 0,
  }
}

export interface PurchaseSummary {
  totalPaidFcfa: number
  coursesCount: number
  activeSubscriptions: number
}

/**
 * Les trois compteurs portent sur l'ensemble des achats, pas sur la page
 * affichée. Un achat remboursé sort du total payé et du décompte : l'apprenant
 * ne l'a plus à sa charge et n'y a plus accès.
 */
export async function getPurchaseSummary(learnerId: string): Promise<PurchaseSummary> {
  const settled = { learnerId, providerStatus: 'SUCCEEDED' as const, refundedAt: null }

  const [paid, courses, subscriptions] = await Promise.all([
    db.purchase.aggregate({ where: settled, _sum: { amountFcfa: true } }),
    db.purchase.findMany({
      where: { ...settled, courseId: { not: null } },
      select: { courseId: true },
      distinct: ['courseId'],
    }),
    db.communitySubscription.count({ where: { learnerId, status: 'ACTIVE' } }),
  ])

  return {
    totalPaidFcfa: paid._sum.amountFcfa ?? 0,
    coursesCount: courses.length,
    activeSubscriptions: subscriptions,
  }
}
