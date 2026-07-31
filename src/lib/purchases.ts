// ==========================================================================
// Lot 4 — Achat : initiation Stripe/CinetPay, Purchase PENDING, réconciliation
// ==========================================================================

import { db } from './db'
import { auditStandalone } from './audit'
import { POST as stripeWebhookHandler } from '@/app/api/webhooks/stripe/route'
import { POST as cinetpayWebhookHandler } from '@/app/api/webhooks/cinetpay/route'

// Simule la réception du webhook provider en dev (pas de clé API configurée).
// Passe par la même route webhook que la production : creditWalletOnPurchase
// n'est jamais appelée directement depuis ce module.
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
  const request = new Request('http://localhost/api/webhooks/cinetpay', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transactionId: providerTransactionId }),
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

  const purchase = await db.purchase.create({
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
