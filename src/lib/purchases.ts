// ==========================================================================
// Lot 4 — Achat : initiation Stripe/CinetPay, Purchase PENDING, réconciliation
// ==========================================================================

import { db } from './db'
import { auditStandalone } from './audit'
import { creditWalletOnPurchase } from './wallet'

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

  // En dev sans clés API : simuler le paiement immédiatement
  if (provider === 'STRIPE' && !process.env.STRIPE_SECRET_KEY) {
    // Simuler un paiement réussi
    await db.$transaction(async (tx) => {
      await creditWalletOnPurchase(tx, providerTransactionId, 'STRIPE')
    })
    return {
      purchaseId: purchase.id,
      providerTransactionId,
      provider: 'STRIPE',
      clientSecret: 'pi_dev_simulated_secret',
    }
  }

  if (provider === 'CINETPAY' && !process.env.CINETPAY_API_KEY) {
    // Simuler un paiement réussi
    await db.$transaction(async (tx) => {
      await creditWalletOnPurchase(tx, providerTransactionId, 'CINETPAY')
    })
    return {
      purchaseId: purchase.id,
      providerTransactionId,
      provider: 'CINETPAY',
      paymentUrl: undefined, // pas d'URL en dev
    }
  }

  // En production :
  // - Stripe : créer un PaymentIntent, retourner clientSecret
  // - CinetPay : créer un paiement, retourner paymentUrl
  // Pour l'instant, on simule aussi

  await db.$transaction(async (tx) => {
    await creditWalletOnPurchase(tx, providerTransactionId, provider)
  })

  return {
    purchaseId: purchase.id,
    providerTransactionId,
    provider,
    ...(provider === 'STRIPE' ? { clientSecret: 'pi_dev_secret' } : {}),
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
