// ==========================================================================
// Lot 2 — Invariants litiges & chargebacks
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import * as email from '@/lib/email'
import { createCourse, publishCourse } from '@/lib/courses'
import { initiatePurchase } from '@/lib/purchases'
import { updateWatchProgress } from '@/lib/access'
import {
  openDispute,
  askLearner,
  resolveDispute,
  autoCloseDisputes,
  completeRefund,
  listTrainerDisputes,
} from '@/lib/disputes'
import { POST as stripeWebhookHandler } from '@/app/api/webhooks/stripe/route'

function chargebackCreatedRequest(providerDisputeId: string, paymentIntentId: string) {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'charge.dispute.created',
      data: { object: { id: providerDisputeId, payment_intent: paymentIntentId } },
    }),
  })
}

function chargebackClosedRequest(providerDisputeId: string, status: 'won' | 'lost') {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'charge.dispute.closed',
      data: { object: { id: providerDisputeId, status } },
    }),
  })
}

describe('Lot 2 — Litiges & chargebacks', () => {

/**
 * Une ressource ne peut plus être publiée sans contenu : `publishCourse` refuse
 * en `CONTENT_REQUIRED`. Les fixtures posent donc la clé directement, sans
 * repasser par la présignature.
 */
/**
 * Ce que `confirmCourseUpload` écrit pour une vidéo : la clé, la taille, le type
 * — et la **durée mesurée sur le fichier** (F3.8). Les tests ne téléversent
 * rien, ils posent donc eux-mêmes le résultat de cette mesure ; sans elle, le
 * seuil de consommation d'un litige n'aurait rien à diviser.
 */
async function withContent(courseId: string, durationSeconds = 3600) {
  await prisma.course.update({
    where: { id: courseId },
    data: {
      contentS3Key: `course-assets/${courseId}/video-fixture.mp4`,
      contentSizeBytes: 1024,
      contentMimeType: 'video/mp4',
      durationSeconds,
    },
  })
}
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  // Formateur + cours publié + apprenant + achat confirmé (wallet crédité à 85 %).
  async function setupPurchase(opts: { price?: number; format?: string; duration?: number } = {}) {
    const trainerUser = await prisma.user.create({ data: { email: 'trainer@test.com', role: 'TRAINER' } })
    const profile = await prisma.trainerProfile.create({
      data: { userId: trainerUser.id, verifiedLegalName: 'Test Trainer', approvedAt: new Date(Date.now() - 40 * 86400000) },
    })
    await prisma.wallet.create({ data: { trainerId: profile.id, balance: 0 } })

    const course = await createCourse(profile.id, trainerUser.id, {
      title: 'Masterclass Node.js',
      blurb: 'Apprenez Node.js en profondeur',
      description: 'Un cours complet sur Node.js.',
      category: 'dev',
      format: opts.format || 'video',
      priceFcfa: opts.price || 15000,
    })
    await withContent(course.id, opts.duration || 3600)
    await publishCourse(course.id, profile.id, trainerUser.id)

    const learner = await prisma.user.create({ data: { email: 'learner@test.com', role: 'LEARNER' } })
    const purchase = await initiatePurchase(course.id, learner.id, 'STRIPE')

    const admin = await prisma.user.create({
      data: { email: 'moderation@test.com', role: 'ADMIN', adminRole: 'MODERATION' },
    })

    return { trainerUser, profile, course, learner, purchase, admin }
  }

  type ResolveArgs = Omit<Parameters<typeof resolveDispute>[1], 'expectedUpdatedAt' | 'actorId' | 'actorAdminRole'>

  // expectedUpdatedAt doit refléter la version courante : on la relit juste avant.
  async function resolveWithFreshVersion(disputeId: string, admin: { id: string }, input: ResolveArgs) {
    const current = await prisma.dispute.findUniqueOrThrow({ where: { id: disputeId } })
    return resolveDispute(disputeId, {
      ...input,
      expectedUpdatedAt: current.updatedAt.toISOString(),
      actorId: admin.id,
      actorAdminRole: 'MODERATION',
    })
  }

  // -------------------------------------------------------------------------
  it('T1 — ouverture : FundReservation ACTIVE, reservedBalance crédité, accès suspendu', async () => {
    const { profile, learner, purchase } = await setupPurchase({ price: 15000 })

    const dispute = await openDispute(learner.id, {
      purchaseId: purchase.purchaseId,
      reason: 'CONTENT_MISMATCH',
      reasonDetail: 'Le contenu ne correspond pas à la description.',
    })

    expect(dispute.status).toBe('OPEN')
    expect(dispute.source).toBe('LEARNER_REQUEST')
    expect(dispute.disputedAmountFcfa).toBe(15000)

    // FR1 : réservation active à 85 % du montant contesté
    const reservation = await prisma.fundReservation.findFirstOrThrow({ where: { disputeId: dispute.id } })
    expect(reservation.status).toBe('ACTIVE')
    expect(reservation.reservedAmountFcfa).toBe(12750)

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { trainerId: profile.id } })
    expect(wallet.balance).toBe(12750)        // inchangé : rien n'est encore débité
    expect(wallet.reservedBalance).toBe(12750)

    // Décision 18 : l'accès est suspendu dès l'ouverture
    const updatedPurchase = await prisma.purchase.findUniqueOrThrow({ where: { id: purchase.purchaseId } })
    expect(updatedPurchase.accessSuspended).toBe(true)
    expect(updatedPurchase.accessSuspendedAt).not.toBeNull()

    // Le snapshot de consommation est figé à l'ouverture (décision 14)
    const snapshot = await prisma.consumptionSnapshot.findUniqueOrThrow({ where: { disputeId: dispute.id } })
    expect(snapshot.ruleApplies).toBe(true)
    expect(snapshot.consumptionPercent).toBe(0)

    // Un second litige sur le même achat est refusé (décision 17)
    await expect(
      openDispute(learner.id, { purchaseId: purchase.purchaseId, reason: 'OTHER' }),
    ).rejects.toThrow('DISPUTE_ALREADY_ACTIVE')
  })

  // -------------------------------------------------------------------------
  it('T7 — REJECT : FundReservation RELEASED, balance intact, accès rétabli', async () => {
    const { profile, learner, purchase, admin } = await setupPurchase({ price: 15000 })

    const dispute = await openDispute(learner.id, { purchaseId: purchase.purchaseId, reason: 'ACCESS_ISSUE' })
    await resolveWithFreshVersion(dispute.id, admin, {
      resolution: 'REJECT',
      resolutionNote: 'Le contenu correspond à la description.',
    })

    const resolved = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })
    expect(resolved.status).toBe('RESOLVED_REJECTED')
    expect(resolved.resolution).toBe('REJECT')
    expect(resolved.refundStatus).toBe('NOT_APPLICABLE')

    // FR2 : libération sans débit
    const reservation = await prisma.fundReservation.findFirstOrThrow({ where: { disputeId: dispute.id } })
    expect(reservation.status).toBe('RELEASED')
    expect(reservation.debitedAmount).toBe(0)
    expect(reservation.releasedAmount).toBe(12750)

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { trainerId: profile.id } })
    expect(wallet.balance).toBe(12750)
    expect(wallet.reservedBalance).toBe(0)

    const updatedPurchase = await prisma.purchase.findUniqueOrThrow({ where: { id: purchase.purchaseId } })
    expect(updatedPurchase.accessSuspended).toBe(false)
    expect(updatedPurchase.refundedAt).toBeNull()
  })

  // -------------------------------------------------------------------------
  it('T6 — FULL_REFUND : FundReservation DEBITED, wallet débité, Purchase.refundedAt', async () => {
    const { profile, learner, purchase, admin } = await setupPurchase({ price: 15000 })

    const dispute = await openDispute(learner.id, { purchaseId: purchase.purchaseId, reason: 'CONTENT_MISMATCH' })
    await resolveWithFreshVersion(dispute.id, admin, {
      resolution: 'FULL_REFUND',
      resolutionNote: 'Remboursement intégral accordé.',
    })

    const resolved = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })
    expect(resolved.status).toBe('RESOLVED_REFUNDED')
    expect(resolved.refundStatus).toBe('COMPLETED')
    expect(resolved.refundProcessedAt).not.toBeNull()

    // FR3 : la réservation est intégralement débitée
    const reservation = await prisma.fundReservation.findFirstOrThrow({ where: { disputeId: dispute.id } })
    expect(reservation.status).toBe('DEBITED')
    expect(reservation.debitedAmount).toBe(12750)

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { trainerId: profile.id } })
    expect(wallet.balance).toBe(0)
    expect(wallet.reservedBalance).toBe(0)

    const updatedPurchase = await prisma.purchase.findUniqueOrThrow({ where: { id: purchase.purchaseId } })
    expect(updatedPurchase.refundedAt).not.toBeNull()
    expect(updatedPurchase.refundAmountFcfa).toBe(15000)
    // Décision 18 : l'accès reste suspendu quand le remboursement est accordé
    expect(updatedPurchase.accessSuspended).toBe(true)
  })

  // -------------------------------------------------------------------------
  it('PARTIAL_REFUND : prorata 85 % débité, le reste libéré (décision 12)', async () => {
    const { profile, learner, purchase, admin } = await setupPurchase({ price: 15000 })

    const dispute = await openDispute(learner.id, { purchaseId: purchase.purchaseId, reason: 'OTHER' })
    await resolveWithFreshVersion(dispute.id, admin, {
      resolution: 'PARTIAL_REFUND',
      refundAmountFcfa: 6000,
      resolutionNote: 'Remboursement partiel.',
    })

    // FR4 : debitedAmount = 85 % × 6000 = 5100 ; releasedAmount = 12750 - 5100
    const reservation = await prisma.fundReservation.findFirstOrThrow({ where: { disputeId: dispute.id } })
    expect(reservation.status).toBe('PARTIALLY_DEBITED')
    expect(reservation.debitedAmount).toBe(5100)
    expect(reservation.releasedAmount).toBe(7650)

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { trainerId: profile.id } })
    expect(wallet.balance).toBe(7650)
    expect(wallet.reservedBalance).toBe(0)

    const updatedPurchase = await prisma.purchase.findUniqueOrThrow({ where: { id: purchase.purchaseId } })
    expect(updatedPurchase.refundAmountFcfa).toBe(6000)
  })

  // -------------------------------------------------------------------------
  it('T8 — auto-timeout : WAITING_LEARNER expiré → RESOLVED_AUTO, accès rétabli', async () => {
    const { profile, learner, purchase, admin } = await setupPurchase({ price: 15000 })

    const dispute = await openDispute(learner.id, { purchaseId: purchase.purchaseId, reason: 'ACCESS_ISSUE' })
    const beforeAsk = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })

    await askLearner(dispute.id, {
      question: 'Pouvez-vous préciser le problème rencontré ?',
      expectedUpdatedAt: beforeAsk.updatedAt.toISOString(),
      actorId: admin.id,
    })

    const waiting = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })
    expect(waiting.status).toBe('WAITING_LEARNER')
    expect(waiting.learnerDeadlineAt).not.toBeNull()

    // Le délai de 7 jours est dépassé
    await prisma.dispute.update({
      where: { id: dispute.id },
      data: { learnerDeadlineAt: new Date(Date.now() - 86400000) },
    })

    const result = await autoCloseDisputes()
    expect(result.closed).toBe(1)

    const closed = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })
    expect(closed.status).toBe('RESOLVED_AUTO')
    expect(closed.resolution).toBe('AUTO_TIMEOUT')
    expect(closed.learnerDeadlineAt).toBeNull()

    const reservation = await prisma.fundReservation.findFirstOrThrow({ where: { disputeId: dispute.id } })
    expect(reservation.status).toBe('RELEASED')

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { trainerId: profile.id } })
    expect(wallet.balance).toBe(12750)
    expect(wallet.reservedBalance).toBe(0)

    const updatedPurchase = await prisma.purchase.findUniqueOrThrow({ where: { id: purchase.purchaseId } })
    expect(updatedPurchase.accessSuspended).toBe(false)

    // Le job est idempotent : un second passage ne referme rien
    expect((await autoCloseDisputes()).closed).toBe(0)
  })

  // -------------------------------------------------------------------------
  // L'idempotence du crédit wallet est couverte par lot4-invariants (webhook
  // rejoué). Le pendant Lot 2 est l'idempotence du DÉBIT : un remboursement
  // confirmé deux fois ne doit pas débiter le formateur deux fois.
  it('remboursement idempotent : 2 appels → 1 seul débit', async () => {
    const { profile, learner, purchase, admin } = await setupPurchase({ price: 15000 })

    const dispute = await openDispute(learner.id, { purchaseId: purchase.purchaseId, reason: 'DOUBLE_CHARGE' })
    await resolveWithFreshVersion(dispute.id, admin, { resolution: 'FULL_REFUND' })

    // Second appel explicite (rejeu d'une confirmation provider / tâche manuelle)
    await completeRefund(dispute.id, 're_replayed', admin.id)

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { trainerId: profile.id } })
    expect(wallet.balance).toBe(0)          // pas -12750
    expect(wallet.reservedBalance).toBe(0)  // pas -12750

    const reservations = await prisma.fundReservation.findMany({ where: { disputeId: dispute.id } })
    expect(reservations).toHaveLength(1)
    expect(reservations[0].debitedAmount).toBe(12750)
  })

  // -------------------------------------------------------------------------
  it('règle 14 jours : ouverture refusée au-delà de la fenêtre', async () => {
    const { learner, purchase } = await setupPurchase({ price: 15000 })

    await prisma.purchase.update({
      where: { id: purchase.purchaseId },
      data: { createdAt: new Date(Date.now() - 15 * 86400000) },
    })

    await expect(
      openDispute(learner.id, { purchaseId: purchase.purchaseId, reason: 'CONTENT_MISMATCH' }),
    ).rejects.toThrow('DISPUTE_WINDOW_EXPIRED')

    expect(await prisma.dispute.count()).toBe(0)
    const untouched = await prisma.purchase.findUniqueOrThrow({ where: { id: purchase.purchaseId } })
    expect(untouched.accessSuspended).toBe(false)
  })

  // -------------------------------------------------------------------------
  it('règle 30 % : ouverture refusée si la vidéo a été consultée à 30 % ou plus', async () => {
    const { course, learner, purchase } = await setupPurchase({ price: 15000, format: 'video', duration: 3600 })

    // 1200 s / 3600 s = 33 %
    await updateWatchProgress(course.id, learner.id, 1200)

    await expect(
      openDispute(learner.id, { purchaseId: purchase.purchaseId, reason: 'CONTENT_MISMATCH' }),
    ).rejects.toThrow('RESOURCE_CONSUMED')

    expect(await prisma.dispute.count()).toBe(0)
    expect(await prisma.fundReservation.count()).toBe(0)
  })

  // -------------------------------------------------------------------------
  it('décision 17 — chargeback sur une vente déjà remboursée : aucun double débit', async () => {
    const { profile, learner, purchase, admin } = await setupPurchase({ price: 15000 })

    // Remboursement complet accordé et encaissé
    const dispute = await openDispute(learner.id, { purchaseId: purchase.purchaseId, reason: 'CONTENT_MISMATCH' })
    await resolveWithFreshVersion(dispute.id, admin, { resolution: 'FULL_REFUND' })

    const walletBefore = await prisma.wallet.findUniqueOrThrow({ where: { trainerId: profile.id } })
    expect(walletBefore.balance).toBe(0)

    // Le chargeback arrive APRÈS le remboursement
    const res = await stripeWebhookHandler(
      chargebackCreatedRequest('dp_test_1', purchase.providerTransactionId),
    )
    expect(res.status).toBe(200)

    // Aucun second litige, aucune nouvelle réservation, aucun débit supplémentaire
    expect(await prisma.dispute.count()).toBe(1)
    expect(await prisma.fundReservation.count()).toBe(1)

    const walletAfter = await prisma.wallet.findUniqueOrThrow({ where: { trainerId: profile.id } })
    expect(walletAfter.balance).toBe(0)
    expect(walletAfter.reservedBalance).toBe(0)

    const prevented = await prisma.auditLog.count({ where: { action: 'DOUBLE_DEBIT_PREVENTED' } })
    expect(prevented).toBe(1)
  })

  // -------------------------------------------------------------------------
  it('T9 / T10 — chargeback : created réserve les fonds, closed les débite ou les libère', async () => {
    const { profile, purchase } = await setupPurchase({ price: 15000 })

    await stripeWebhookHandler(chargebackCreatedRequest('dp_test_2', purchase.providerTransactionId))

    const opened = await prisma.dispute.findFirstOrThrow({ where: { providerDisputeId: 'dp_test_2' } })
    expect(opened.source).toBe('STRIPE_CHARGEBACK')
    expect(opened.status).toBe('OPEN')

    const duringChargeback = await prisma.purchase.findUniqueOrThrow({ where: { id: purchase.purchaseId } })
    expect(duringChargeback.providerDisputeActive).toBe(true)
    expect(duringChargeback.accessSuspended).toBe(true)

    let wallet = await prisma.wallet.findUniqueOrThrow({ where: { trainerId: profile.id } })
    expect(wallet.reservedBalance).toBe(12750)

    // T9 — chargeback perdu : le provider a déjà repris l'argent
    await stripeWebhookHandler(chargebackClosedRequest('dp_test_2', 'lost'))

    const lost = await prisma.dispute.findUniqueOrThrow({ where: { id: opened.id } })
    expect(lost.status).toBe('RESOLVED_REFUNDED')
    expect(lost.refundStatus).toBe('COMPLETED')
    expect(lost.resolvedById).toBeNull()

    wallet = await prisma.wallet.findUniqueOrThrow({ where: { trainerId: profile.id } })
    expect(wallet.balance).toBe(0)
    expect(wallet.reservedBalance).toBe(0)

    const after = await prisma.purchase.findUniqueOrThrow({ where: { id: purchase.purchaseId } })
    expect(after.providerDisputeActive).toBe(false)
    expect(after.refundedAt).not.toBeNull()
  })

  // -------------------------------------------------------------------------
  // Les notifications partent après le commit : une panne Resend ne doit pas
  // faire échouer une transition déjà persistée (sinon l'appelant reçoit un 500
  // alors que le litige existe, et son retry tombe sur DISPUTE_ALREADY_ACTIVE).
  it('une panne d\'email ne fait pas échouer l\'ouverture du litige', async () => {
    const { profile, learner, purchase } = await setupPurchase({ price: 15000 })

    const spy = vi.spyOn(email, 'sendEmail').mockRejectedValue(new Error('Email send failed: service unavailable'))
    try {
      const dispute = await openDispute(learner.id, { purchaseId: purchase.purchaseId, reason: 'ACCESS_ISSUE' })
      expect(dispute.status).toBe('OPEN')
    } finally {
      spy.mockRestore()
    }

    // Le litige et ses effets financiers sont bien en base
    expect(await prisma.dispute.count()).toBe(1)
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { trainerId: profile.id } })
    expect(wallet.reservedBalance).toBe(12750)
    const suspended = await prisma.purchase.findUniqueOrThrow({ where: { id: purchase.purchaseId } })
    expect(suspended.accessSuspended).toBe(true)

    // L'échec de livraison est journalisé, pas avalé
    const failures = await prisma.auditLog.count({ where: { action: 'NOTIFICATION_DELIVERY_FAILED' } })
    expect(failures).toBe(1)
  })

  // -------------------------------------------------------------------------
  it('décision 19 — le formateur ne voit jamais reasonDetail', async () => {
    const { profile, learner, purchase } = await setupPurchase({ price: 15000 })

    await openDispute(learner.id, {
      purchaseId: purchase.purchaseId,
      reason: 'CONTENT_MISMATCH',
      reasonDetail: 'Motif libre confidentiel qui ne doit jamais remonter au formateur.',
    })

    const { items } = await listTrainerDisputes(profile.id)
    expect(items).toHaveLength(1)
    expect(items[0]).not.toHaveProperty('reasonDetail')
    expect(items[0]).not.toHaveProperty('messages')
    expect(items[0].reason).toBe('CONTENT_MISMATCH')
    expect(items[0].purchase.course?.title).toBe('Masterclass Node.js')
    expect(JSON.stringify(items[0])).not.toContain('confidentiel')
  })
})
