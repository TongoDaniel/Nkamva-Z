// ==========================================================================
// Lot 2 — Tests d'invariants (litiges & chargebacks)
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { createCourse, publishCourse } from '@/lib/courses'
import { initiatePurchase } from '@/lib/purchases'
import { updateWatchProgress } from '@/lib/access'
import {
  openDispute, rejectDispute, resolveDisputeWithRefund, autoTimeoutDisputes,
  completeRefund, addSupportMessage, askLearner,
} from '@/lib/disputes'

describe('Lot 2 — Litiges & chargebacks', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function createModerationAdmin() {
    return prisma.user.create({ data: { email: `mod-${crypto.randomUUID()}@test.com`, role: 'ADMIN', adminRole: 'MODERATION' } })
  }

  async function setupPurchase(opts: { price?: number; duration?: number } = {}) {
    const trainerUser = await prisma.user.create({ data: { email: `trainer-${crypto.randomUUID()}@test.com`, role: 'TRAINER' } })
    const profile = await prisma.trainerProfile.create({ data: { userId: trainerUser.id, verifiedLegalName: 'Test Trainer', approvedAt: new Date(Date.now() - 40 * 86400000) } })
    const course = await createCourse(profile.id, trainerUser.id, {
      title: 'Cours litige', blurb: 'Blurb', description: 'Description complète du cours.',
      category: 'dev', format: 'video', priceFcfa: opts.price || 10000, durationSeconds: opts.duration || 3600,
    })
    await publishCourse(course.id, profile.id, trainerUser.id)
    const learner = await prisma.user.create({ data: { email: `learner-${crypto.randomUUID()}@test.com`, role: 'LEARNER' } })
    const result = await initiatePurchase(course.id, learner.id, 'STRIPE')
    return { trainerUser, profile, course, learner, purchaseId: result.purchaseId }
  }

  // -------------------------------------------------------------------------
  it('T1 : ouverture litige → FundReservation ACTIVE + accessSuspended', async () => {
    const { learner, purchaseId, profile } = await setupPurchase({ price: 10000 })

    const dispute = await openDispute(learner.id, purchaseId, 'CONTENT_MISMATCH', 'Ne correspond pas à la description')

    const purchase = await prisma.purchase.findUniqueOrThrow({ where: { id: purchaseId } })
    expect(purchase.accessSuspended).toBe(true)

    const reservation = await prisma.fundReservation.findFirstOrThrow({ where: { disputeId: dispute.id } })
    expect(reservation.status).toBe('ACTIVE')
    expect(reservation.reservedAmountFcfa).toBe(8500) // 85 % de 10000

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { trainerId: profile.id } })
    expect(wallet.reservedBalance).toBe(8500)
  })

  // -------------------------------------------------------------------------
  it('T7 : REJECT → FundReservation RELEASED + accessSuspended rétabli', async () => {
    const { learner, purchaseId, profile } = await setupPurchase({ price: 10000 })
    const dispute = await openDispute(learner.id, purchaseId, 'OTHER')
    const admin = await createModerationAdmin()

    await rejectDispute(dispute.id, admin.id, dispute.updatedAt)

    const purchase = await prisma.purchase.findUniqueOrThrow({ where: { id: purchaseId } })
    expect(purchase.accessSuspended).toBe(false)

    const reservation = await prisma.fundReservation.findFirstOrThrow({ where: { disputeId: dispute.id } })
    expect(reservation.status).toBe('RELEASED')

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { trainerId: profile.id } })
    expect(wallet.reservedBalance).toBe(0)
    expect(wallet.balance).toBe(8500) // le solde n'est jamais débité sur un rejet

    const d = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })
    expect(d.status).toBe('RESOLVED_REJECTED')
  })

  // -------------------------------------------------------------------------
  it('T6 : FULL_REFUND → FundReservation DEBITED + wallet débité + Purchase.refundedAt', async () => {
    const { learner, purchaseId, profile } = await setupPurchase({ price: 10000 })
    const dispute = await openDispute(learner.id, purchaseId, 'OTHER')
    const admin = await createModerationAdmin()

    await resolveDisputeWithRefund(dispute.id, admin.id, dispute.updatedAt, { resolutionType: 'FULL_REFUND' })

    const reservation = await prisma.fundReservation.findFirstOrThrow({ where: { disputeId: dispute.id } })
    expect(reservation.status).toBe('DEBITED')
    expect(reservation.debitedAmount).toBe(8500)

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { trainerId: profile.id } })
    expect(wallet.reservedBalance).toBe(0)
    expect(wallet.balance).toBe(0) // 8500 crédités à l'achat, 8500 débités au remboursement

    const purchase = await prisma.purchase.findUniqueOrThrow({ where: { id: purchaseId } })
    expect(purchase.refundedAt).not.toBeNull()
    expect(purchase.accessSuspended).toBe(true) // reste suspendu définitivement après remboursement (Lot 2 §6)

    const d = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })
    expect(d.status).toBe('RESOLVED_REFUNDED')
    expect(d.refundStatus).toBe('COMPLETED')
  })

  // -------------------------------------------------------------------------
  it('T8 : auto-timeout → RESOLVED_AUTO + accès rétabli', async () => {
    const { learner, purchaseId } = await setupPurchase({ price: 10000 })
    const dispute = await openDispute(learner.id, purchaseId, 'OTHER')
    const admin = await createModerationAdmin()

    await addSupportMessage(dispute.id, admin.id, 'Bonjour, pouvez-vous préciser le problème ?') // T2
    const afterT2 = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })
    await askLearner(dispute.id, admin.id, afterT2.updatedAt, 'Merci de préciser le contenu concerné') // T3

    // Simule le délai de réponse (7 jours) dépassé
    await prisma.dispute.update({ where: { id: dispute.id }, data: { learnerDeadlineAt: new Date(Date.now() - 1000) } })

    const count = await autoTimeoutDisputes()
    expect(count).toBe(1)

    const d = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })
    expect(d.status).toBe('RESOLVED_AUTO')

    const purchase = await prisma.purchase.findUniqueOrThrow({ where: { id: purchaseId } })
    expect(purchase.accessSuspended).toBe(false)
  })

  // -------------------------------------------------------------------------
  it('remboursement idempotent : rejouer la confirmation ne débite qu\'une fois', async () => {
    const { learner, purchaseId, profile } = await setupPurchase({ price: 10000 })
    const dispute = await openDispute(learner.id, purchaseId, 'OTHER')
    const admin = await createModerationAdmin()

    await resolveDisputeWithRefund(dispute.id, admin.id, dispute.updatedAt, { resolutionType: 'FULL_REFUND' })
    // Rejeu de la confirmation (ex. webhook provider dupliqué)
    await completeRefund(dispute.id, 8500, 're_replayed', admin.id)

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { trainerId: profile.id } })
    expect(wallet.balance).toBe(0) // pas -8500 une seconde fois
  })

  // -------------------------------------------------------------------------
  it('règle 14j : litige refusé après 14 jours', async () => {
    const { learner, purchaseId } = await setupPurchase({ price: 10000 })
    await prisma.purchase.update({ where: { id: purchaseId }, data: { createdAt: new Date(Date.now() - 15 * 86400000) } })

    await expect(openDispute(learner.id, purchaseId, 'OTHER')).rejects.toThrow('REFUND_DEADLINE_EXPIRED')
  })

  // -------------------------------------------------------------------------
  it('règle 30% : litige refusé si vidéo consultée à 30%+', async () => {
    const { learner, purchaseId, course } = await setupPurchase({ price: 10000, duration: 1000 })
    await updateWatchProgress(course.id, learner.id, 400) // 40 %

    await expect(openDispute(learner.id, purchaseId, 'OTHER')).rejects.toThrow('CONSUMPTION_THRESHOLD_EXCEEDED')
  })
})
