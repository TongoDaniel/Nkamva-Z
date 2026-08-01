// ==========================================================================
// Lot 2 — Chargebacks opérateur (T1 source provider, T9, T10) et décision 17
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { openDispute, TRAINER_SHARE_RATE } from '@/lib/disputes'
import { resolveDispute } from '@/lib/dispute-review'
import { openChargebackDispute, closeChargebackDispute } from '@/lib/chargebacks'
import { POST as stripeWebhook } from '@/app/api/webhooks/stripe/route'

const DAY = 86_400_000
const AMOUNT = 20_000
const RESERVED = Math.round(AMOUNT * TRAINER_SHARE_RATE)

function stripeEvent(type: string, object: Record<string, unknown>) {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type, data: { object } }),
  })
}

describe('Lot 2 — Chargebacks', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup() {
    const trainerUser = await prisma.user.create({ data: { email: `t-${crypto.randomUUID()}@test.com`, role: 'TRAINER' } })
    const trainer = await prisma.trainerProfile.create({ data: { userId: trainerUser.id } })
    const wallet = await prisma.wallet.create({ data: { trainerId: trainer.id, balance: RESERVED } })
    const learner = await prisma.user.create({ data: { email: `l-${crypto.randomUUID()}@test.com` } })
    const admin = await prisma.user.create({
      data: { email: `a-${crypto.randomUUID()}@test.com`, role: 'ADMIN', adminRole: 'MODERATION' },
    })
    const course = await prisma.course.create({
      data: {
        trainerId: trainer.id, slug: `c-${crypto.randomUUID()}`, title: 'Masterclass DDD',
        blurb: 'Accroche', description: 'Description', category: 'Développement', format: 'video',
        priceFcfa: AMOUNT, status: 'published', publishedAt: new Date(), durationSeconds: 3600,
      },
    })
    const providerTransactionId = `pi_${crypto.randomUUID()}`
    const purchase = await prisma.purchase.create({
      data: {
        learnerId: learner.id, trainerId: trainer.id, courseId: course.id,
        amountFcfa: AMOUNT, commissionRate: 0.15, trainerShareFcfa: RESERVED,
        platformShareFcfa: AMOUNT - RESERVED, provider: 'STRIPE',
        providerTransactionId, providerStatus: 'SUCCEEDED',
        createdAt: new Date(Date.now() - 2 * DAY),
      },
    })
    return { wallet, learner, admin, course, purchase, providerTransactionId }
  }

  const wallet = (id: string) => prisma.wallet.findUnique({ where: { id } });

  // --- T1, source opérateur ---

  it('ouvre un dossier et gèle les fonds, sans contrôle de recevabilité', async () => {
    const { wallet: w, purchase, providerTransactionId } = await setup()
    // Achat ancien et intégralement consulté : un apprenant n'aurait pas pu
    // contester. La banque, si.
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: { createdAt: new Date(Date.now() - 60 * DAY) },
    })
    await prisma.courseView.create({
      data: { courseId: purchase.courseId!, learnerId: purchase.learnerId, watchedSeconds: 3600 },
    })

    const result = await openChargebackDispute({
      providerTransactionId,
      providerDisputeId: 'dp_test_1',
      source: 'STRIPE_CHARGEBACK',
    })
    expect(result.opened).toBe(true)

    const dispute = await prisma.dispute.findUnique({ where: { id: result.disputeId! } })
    expect(dispute).toMatchObject({
      source: 'STRIPE_CHARGEBACK',
      reason: 'UNAUTHORIZED_CHARGE',
      providerDisputeId: 'dp_test_1',
      status: 'OPEN',
    })

    // Le constat est pris quand même : la modération en a besoin pour instruire.
    const snapshot = await prisma.consumptionSnapshot.findUnique({ where: { disputeId: dispute!.id } })
    expect(snapshot!.consumptionPercent).toBe(100)

    const after = await wallet(w.id)
    expect(after!.reservedBalance).toBe(RESERVED)
    expect(after!.balance).toBe(RESERVED)

    const purchaseAfter = await prisma.purchase.findUnique({ where: { id: purchase.id } })
    expect(purchaseAfter!.accessSuspended).toBe(true)
    // Le drapeau qui interdit à la modération de rembourser en parallèle.
    expect(purchaseAfter!.providerDisputeActive).toBe(true)
  })

  it('le message d’ouverture est un message système, sans auteur', async () => {
    const { providerTransactionId } = await setup()
    const { disputeId } = await openChargebackDispute({
      providerTransactionId, providerDisputeId: 'dp_test_2', source: 'STRIPE_CHARGEBACK',
    })

    const message = await prisma.disputeMessage.findFirst({ where: { disputeId } })
    expect(message).toMatchObject({ authorRole: 'SYSTEM', authorId: null })
  })

  // --- Décision 17 ---

  it('n’ouvre rien si l’achat a déjà été remboursé', async () => {
    const { wallet: w, purchase, providerTransactionId } = await setup()
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: { refundedAt: new Date(), providerStatus: 'REFUNDED' },
    })

    const result = await openChargebackDispute({
      providerTransactionId, providerDisputeId: 'dp_test_3', source: 'STRIPE_CHARGEBACK',
    })
    expect(result).toMatchObject({ opened: false, doubleDebitPrevented: true })

    // Rien n'est gelé : le formateur a déjà supporté ce remboursement.
    expect(await prisma.dispute.count()).toBe(0)
    expect((await wallet(w.id))!.reservedBalance).toBe(0)

    // Le drapeau est posé pour que l'écran admin le signale.
    expect((await prisma.purchase.findUnique({ where: { id: purchase.id } }))!.providerDisputeActive).toBe(true)

    const log = await prisma.auditLog.findFirst({
      where: { action: 'DOUBLE_DEBIT_PREVENTED', targetId: purchase.id },
    })
    expect(log).not.toBeNull()
  })

  it('bloque un remboursement de la modération pendant un chargeback', async () => {
    const { learner, admin, purchase, providerTransactionId } = await setup()
    const dispute = await openDispute(learner.id, {
      purchaseId: purchase.id,
      reason: 'CONTENT_MISMATCH',
      reasonDetail: 'Le contenu ne correspond pas à la fiche produit.',
    })

    // La banque conteste pendant l'instruction : le dossier existant est
    // rattaché plutôt que doublé.
    const result = await openChargebackDispute({
      providerTransactionId, providerDisputeId: 'dp_test_4', source: 'STRIPE_CHARGEBACK',
    })
    expect(result).toMatchObject({ opened: false, disputeId: dispute.id })
    expect(await prisma.dispute.count()).toBe(1)
    expect(
      (await prisma.dispute.findUnique({ where: { id: dispute.id } }))!.providerDisputeId,
    ).toBe('dp_test_4')

    const fresh = (await prisma.dispute.findUnique({ where: { id: dispute.id } }))!
    await expect(
      resolveDispute(dispute.id, admin.id, false, {
        expectedUpdatedAt: fresh.updatedAt.toISOString(),
        resolution: 'FULL_REFUND',
        note: 'Contenu non conforme à la description.',
      }),
    ).rejects.toThrow('PROVIDER_DISPUTE_ACTIVE')
  })

  // --- T9 : chargeback perdu ---

  it('T9 — perdu : le formateur est débité, sans tâche manuelle', async () => {
    const { wallet: w, purchase, providerTransactionId } = await setup()
    await openChargebackDispute({
      providerTransactionId, providerDisputeId: 'dp_test_5', source: 'STRIPE_CHARGEBACK',
    })

    const result = await closeChargebackDispute({
      providerDisputeId: 'dp_test_5',
      outcome: 'LOST',
      providerRefundId: 'rf_test_5',
    })
    expect(result.closed).toBe(true)

    const dispute = await prisma.dispute.findUnique({ where: { id: result.disputeId! } })
    expect(dispute).toMatchObject({
      status: 'RESOLVED_REFUNDED',
      resolution: 'FULL_REFUND',
      refundStatus: 'COMPLETED',
    })
    // Personne n'a tranché de notre côté.
    expect(dispute!.resolvedById).toBeNull()

    // L'argent est déjà parti chez l'opérateur : le débit est immédiat et il
    // n'y a rien à exécuter à la main.
    const after = await wallet(w.id)
    expect(after!.reservedBalance).toBe(0)
    expect(after!.balance).toBe(0)
    expect(await prisma.manualRefundTask.count()).toBe(0)

    const purchaseAfter = await prisma.purchase.findUnique({ where: { id: purchase.id } })
    expect(purchaseAfter!.refundedAt).not.toBeNull()
    expect(purchaseAfter!.providerDisputeActive).toBe(false)
    // Décision 18 : un remboursement ne rend pas l'accès.
    expect(purchaseAfter!.accessSuspended).toBe(true)
  })

  // --- T10 : chargeback gagné ---

  it('T10 — gagné : les fonds et l’accès reviennent', async () => {
    const { wallet: w, purchase, providerTransactionId } = await setup()
    await openChargebackDispute({
      providerTransactionId, providerDisputeId: 'dp_test_6', source: 'STRIPE_CHARGEBACK',
    })

    const result = await closeChargebackDispute({ providerDisputeId: 'dp_test_6', outcome: 'WON' })
    expect(result.closed).toBe(true)

    const dispute = await prisma.dispute.findUnique({ where: { id: result.disputeId! } })
    expect(dispute).toMatchObject({ status: 'RESOLVED_REJECTED', refundStatus: 'NOT_APPLICABLE' })

    const after = await wallet(w.id)
    expect(after!.reservedBalance).toBe(0)
    // Rendus, pas débités.
    expect(after!.balance).toBe(RESERVED)

    const purchaseAfter = await prisma.purchase.findUnique({ where: { id: purchase.id } })
    expect(purchaseAfter!.accessSuspended).toBe(false)
    expect(purchaseAfter!.providerDisputeActive).toBe(false)
  })

  it('ne revient pas sur une décision humaine déjà prise', async () => {
    const { learner, admin, purchase, providerTransactionId, wallet: w } = await setup()
    const dispute = await openDispute(learner.id, {
      purchaseId: purchase.id,
      reason: 'CONTENT_MISMATCH',
      reasonDetail: 'Le contenu ne correspond pas à la fiche produit.',
    })
    await openChargebackDispute({
      providerTransactionId, providerDisputeId: 'dp_test_7', source: 'STRIPE_CHARGEBACK',
    })
    // La modération écarte le dossier avant que l'opérateur ne tranche.
    await prisma.purchase.update({ where: { id: purchase.id }, data: { providerDisputeActive: false } })
    const fresh = (await prisma.dispute.findUnique({ where: { id: dispute.id } }))!
    await resolveDispute(dispute.id, admin.id, false, {
      expectedUpdatedAt: fresh.updatedAt.toISOString(),
      resolution: 'REJECT',
      note: 'La ressource correspond à la description publiée.',
    })
    const balanceAfterReject = (await wallet(w.id))!.balance

    const result = await closeChargebackDispute({ providerDisputeId: 'dp_test_7', outcome: 'LOST' })
    expect(result).toMatchObject({ closed: false, reason: 'DISPUTE_ALREADY_RESOLVED' })

    // Le statut et le solde restent ceux de la décision humaine.
    expect((await prisma.dispute.findUnique({ where: { id: dispute.id } }))!.status).toBe('RESOLVED_REJECTED')
    expect((await wallet(w.id))!.balance).toBe(balanceAfterReject)
    expect((await prisma.purchase.findUnique({ where: { id: purchase.id } }))!.providerDisputeActive).toBe(false)
  })

  it('reste silencieux sur une transaction inconnue', async () => {
    const result = await openChargebackDispute({
      providerTransactionId: 'pi_inexistant',
      providerDisputeId: 'dp_test_8',
      source: 'STRIPE_CHARGEBACK',
    })
    expect(result).toMatchObject({ opened: false, reason: 'PURCHASE_NOT_FOUND' })
    expect(await prisma.auditLog.count({ where: { action: 'CHARGEBACK_PURCHASE_UNKNOWN' } })).toBe(1)
  })

  // --- Webhook ---

  it('le webhook ouvre puis clôt le dossier', async () => {
    const { wallet: w, purchase, providerTransactionId } = await setup()

    const created = await stripeWebhook(
      stripeEvent('charge.dispute.created', {
        id: 'dp_hook_1',
        payment_intent: providerTransactionId,
      }),
    )
    expect(created.status).toBe(200)
    expect(await prisma.dispute.count({ where: { providerDisputeId: 'dp_hook_1' } })).toBe(1)
    expect((await wallet(w.id))!.reservedBalance).toBe(RESERVED)

    const closed = await stripeWebhook(
      stripeEvent('charge.dispute.closed', { id: 'dp_hook_1', status: 'won' }),
    )
    expect(closed.status).toBe(200)
    expect((await wallet(w.id))!.reservedBalance).toBe(0)
    expect((await prisma.purchase.findUnique({ where: { id: purchase.id } }))!.accessSuspended).toBe(false)
  })

  it('le webhook ignore une clôture sans issue tranchée', async () => {
    const { providerTransactionId } = await setup()
    await stripeWebhook(
      stripeEvent('charge.dispute.created', { id: 'dp_hook_2', payment_intent: providerTransactionId }),
    )

    const res = await stripeWebhook(
      stripeEvent('charge.dispute.closed', { id: 'dp_hook_2', status: 'warning_closed' }),
    )
    expect(res.status).toBe(200)
    // Le dossier reste ouvert : rien n'a été tranché.
    expect(
      (await prisma.dispute.findFirst({ where: { providerDisputeId: 'dp_hook_2' } }))!.status,
    ).toBe('OPEN')
    expect(
      await prisma.auditLog.count({ where: { action: 'CHARGEBACK_CLOSED_WITHOUT_OUTCOME' } }),
    ).toBe(1)
  })

  it('le webhook répond 200 sur un événement inexploitable', async () => {
    // Sans payment_intent ni clé Stripe pour remonter à la charge, l'événement
    // ne permet pas de retrouver l'achat. Répondre en erreur ferait rejouer
    // Stripe indéfiniment.
    const res = await stripeWebhook(stripeEvent('charge.dispute.created', { id: 'dp_hook_3' }))
    expect(res.status).toBe(200)
    expect(
      await prisma.auditLog.count({ where: { action: 'CHARGEBACK_TRANSACTION_UNRESOLVED' } }),
    ).toBe(1)
  })

  it('le crédit à l’encaissement continue de fonctionner', async () => {
    const { wallet: w, providerTransactionId } = await setup()
    await prisma.purchase.update({
      where: { providerTransactionId },
      data: { providerStatus: 'PENDING' },
    })
    const before = (await wallet(w.id))!.balance

    const res = await stripeWebhook(
      stripeEvent('payment_intent.succeeded', { id: providerTransactionId }),
    )
    expect(res.status).toBe(200)
    expect((await wallet(w.id))!.balance).toBe(before + RESERVED)
  })
})
