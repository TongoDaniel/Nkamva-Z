// ==========================================================================
// Lot 4 — Achat : initiation Stripe/CinetPay, Purchase PENDING, réconciliation
// ==========================================================================

import type { PaymentStatus } from '@prisma/client'
import { db } from './db'
import { auditStandalone } from './audit'
import { POST as stripeWebhookHandler } from '@/app/api/webhooks/stripe/route'
import { POST as cinetpayWebhookHandler } from '@/app/api/webhooks/cinetpay/route'

// Simule la réception du webhook provider en dev (pas de clé API configurée).
// Passe par la même route webhook que la production : creditWalletOnPurchase
// n'est jamais appelée directement depuis ce module.
export async function simulateProviderWebhook(
  provider: 'STRIPE' | 'CINETPAY',
  providerTransactionId: string,
): Promise<void> {
  if (provider === 'STRIPE') await simulateStripeWebhook(providerTransactionId)
  else await simulateCinetPayWebhook(providerTransactionId)
}

/**
 * Le provider est-il en mode simulé ? Sans clé API, aucun paiement réel ne peut
 * être ouvert : le dev fait tenir au webhook le rôle de l'opérateur.
 */
export function providerIsSimulated(provider: 'STRIPE' | 'CINETPAY'): boolean {
  return provider === 'STRIPE' ? !process.env.STRIPE_SECRET_KEY : !process.env.CINETPAY_API_KEY
}

async function simulateStripeWebhook(providerTransactionId: string): Promise<void> {
  const event = {
    id: `evt_dev_${crypto.randomUUID()}`,
    object: 'event',
    type: 'payment_intent.succeeded',
    data: { object: { id: providerTransactionId, object: 'payment_intent', status: 'succeeded' } },
  }
  const request = new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
  })
  const res = await stripeWebhookHandler(request)
  if (!res.ok) throw new Error('DEV_WEBHOOK_SIMULATION_FAILED')
}

async function simulateCinetPayWebhook(providerTransactionId: string): Promise<void> {
  // Reproduit le format réel (form-urlencoded, champ cpm_trans_id) pour
  // exercer le même chemin de parsing qu'un vrai webhook CinetPay.
  const body = new URLSearchParams({ cpm_trans_id: providerTransactionId, cpm_site_id: process.env.CINETPAY_SITE_ID || 'dev' }).toString()
  const request = new Request('http://localhost/api/webhooks/cinetpay', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  const res = await cinetpayWebhookHandler(request)
  if (!res.ok) throw new Error('DEV_WEBHOOK_SIMULATION_FAILED')
}

export interface InitiatePurchaseResult {
  purchaseId: string
  providerTransactionId: string
  paymentUrl?: string  // URL de paiement CinetPay (Stripe utilise client-side)
  clientSecret?: string  // Stripe PaymentIntent client_secret
  provider: 'STRIPE' | 'CINETPAY'
}

// --- Initier un achat ---

export async function initiatePurchase(
  courseId: string,
  learnerId: string,
  provider: 'STRIPE' | 'CINETPAY',
): Promise<InitiatePurchaseResult> {
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
    // Retourner l'achat existant
    return {
      purchaseId: existing.id,
      providerTransactionId: existing.providerTransactionId!,
      provider: existing.provider,
    }
  }

  const amountFcfa = course.priceFcfa
  const commissionRate = course.trainerProfile.commissionRate
  const trainerShareFcfa = Math.round(amountFcfa * (1 - commissionRate))
  const platformShareFcfa = amountFcfa - trainerShareFcfa

  // Générer un providerTransactionId unique
  const providerTransactionId = provider === 'STRIPE'
    ? `pi_${crypto.randomUUID()}`
    : `cp_${crypto.randomUUID()}`

  // Le contrôle d'achat existant ci-dessus lit avant d'écrire : deux requêtes
  // simultanées voyaient toutes deux « aucun achat » et inséraient chacune la
  // leur. L'apprenant était débité deux fois et le formateur crédité deux fois —
  // chaque achat portant son propre `providerTransactionId`, l'idempotence de
  // `creditWalletOnPurchase` ne rattrapait rien. Reproduit 2 fois sur 6.
  // C'est désormais l'index unique partiel `purchases_active_course_unique` qui
  // tranche, en base : le perdant de la course retombe sur l'achat du gagnant.
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
        providerTransactionId,
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
    return {
      purchaseId: winner.id,
      providerTransactionId: winner.providerTransactionId!,
      provider: winner.provider,
    }
  }

  await auditStandalone({
    actorId: learnerId, actorRole: 'LEARNER',
    action: 'PURCHASE_INITIATED', targetType: 'Purchase', targetId: purchase.id,
    meta: { courseId, amountFcfa, provider, providerTransactionId },
  })

  // En dev sans clés API : simuler la confirmation en repassant par la vraie
  // route webhook (creditWalletOnPurchase n'est appelée que depuis elle).
  if (provider === 'STRIPE' && !process.env.STRIPE_SECRET_KEY) {
    await simulateStripeWebhook(providerTransactionId)
    return {
      purchaseId: purchase.id,
      providerTransactionId,
      provider: 'STRIPE',
      clientSecret: 'pi_dev_simulated_secret',
    }
  }

  if (provider === 'CINETPAY' && !process.env.CINETPAY_API_KEY) {
    await simulateCinetPayWebhook(providerTransactionId)
    return {
      purchaseId: purchase.id,
      providerTransactionId,
      provider: 'CINETPAY',
      paymentUrl: undefined, // pas d'URL en dev
    }
  }

  // Clés réelles configurées : création du paiement côté provider (PaymentIntent
  // Stripe / paiement CinetPay) non implémentée à ce stade — hors périmètre de
  // cette étape. La Purchase reste PENDING : le crédit n'intervient que lorsque
  // le vrai webhook provider confirme le paiement (voir /api/webhooks/stripe et
  // /api/webhooks/cinetpay). Un paiement non confirmé ne crédite jamais.
  return {
    purchaseId: purchase.id,
    providerTransactionId,
    provider,
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

  // En production : appeler l'API provider pour vérifier le statut
  // - Stripe : stripe.paymentIntents.retrieve(providerTransactionId)
  // - CinetPay : API /payment/check
  // Si le provider dit SUCCESS → créditer le wallet

  // En dev : ne rien faire (le crédit a déjà été fait à l'initiation)
  return { status: purchase.providerStatus, credited: false }
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
