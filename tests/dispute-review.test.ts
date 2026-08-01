// ==========================================================================
// Lot 2 — Arbitrage : T2, T3/T5, T6, T7 et mouvements de fonds FR2 à FR5
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { openDispute, TRAINER_SHARE_RATE } from '@/lib/disputes'
import {
  postSupportMessage,
  askLearner,
  resolveDispute,
  completeManualRefundTask,
  cancelManualRefundTask,
  listManualRefundTasks,
  getDisputeStats,
} from '@/lib/dispute-review'

const DAY = 86_400_000
const AMOUNT = 20_000
const RESERVED = Math.round(AMOUNT * TRAINER_SHARE_RATE) // 17 000

async function expectFailure(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toThrow(code)
}

describe('Lot 2 — Arbitrage des litiges', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup(opts: { provider?: 'STRIPE' | 'CINETPAY'; purchasedDaysAgo?: number; watchedSeconds?: number } = {}) {
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
    const purchase = await prisma.purchase.create({
      data: {
        learnerId: learner.id, trainerId: trainer.id, courseId: course.id,
        amountFcfa: AMOUNT, commissionRate: 0.15, trainerShareFcfa: RESERVED,
        platformShareFcfa: AMOUNT - RESERVED, provider: opts.provider ?? 'STRIPE',
        providerTransactionId: `tx_${crypto.randomUUID()}`, providerStatus: 'SUCCEEDED',
        createdAt: new Date(Date.now() - (opts.purchasedDaysAgo ?? 2) * DAY),
      },
    })
    if (opts.watchedSeconds) {
      await prisma.courseView.create({
        data: { courseId: course.id, learnerId: learner.id, watchedSeconds: opts.watchedSeconds },
      })
    }
    const dispute = await openDispute(learner.id, {
      purchaseId: purchase.id,
      reason: 'CONTENT_MISMATCH',
      reasonDetail: 'Le contenu ne correspond pas à la fiche produit.',
    })
    const fresh = (await prisma.dispute.findUnique({ where: { id: dispute.id } }))!
    return { trainer, wallet, learner, admin, course, purchase, dispute: fresh }
  }

  const wallet = (id: string) => prisma.wallet.findUnique({ where: { id } })

  // --- T2 ---

  it('T2 — le premier mot du support met le dossier en examen', async () => {
    const { admin, dispute } = await setup()

    await postSupportMessage(dispute.id, admin.id, 'Bonjour, nous examinons votre dossier.')

    const after = await prisma.dispute.findUnique({ where: { id: dispute.id } })
    expect(after!.status).toBe('IN_REVIEW')
    const message = await prisma.disputeMessage.findFirst({
      where: { disputeId: dispute.id, authorRole: 'SUPPORT' },
    })
    // L'apprenant ne l'a pas encore lu.
    expect(message!.readByLearner).toBe(false)
  })

  it('T2 — un second message ne rechange pas l’état', async () => {
    const { admin, dispute } = await setup()
    await postSupportMessage(dispute.id, admin.id, 'Premier message du support.')
    await prisma.dispute.update({ where: { id: dispute.id }, data: { status: 'WAITING_LEARNER' } })

    await postSupportMessage(dispute.id, admin.id, 'Second message du support.')
    expect((await prisma.dispute.findUnique({ where: { id: dispute.id } }))!.status).toBe('WAITING_LEARNER')
  })

  // --- T3 / T5 ---

  it('T3 — poser une question ouvre un délai de sept jours', async () => {
    const { admin, dispute } = await setup()

    await askLearner(dispute.id, admin.id, {
      expectedUpdatedAt: dispute.updatedAt.toISOString(),
      question: 'Pouvez-vous préciser ce qui manque par rapport à la fiche ?',
    })

    const after = await prisma.dispute.findUnique({ where: { id: dispute.id } })
    expect(after!.status).toBe('WAITING_LEARNER')
    const days = (after!.learnerDeadlineAt!.getTime() - Date.now()) / DAY
    expect(days).toBeGreaterThan(6.9)
    expect(days).toBeLessThan(7.1)

    // L'échéance est écrite dans le fil, au même endroit que la question.
    const messages = await prisma.disputeMessage.findMany({ where: { disputeId: dispute.id } })
    expect(messages.some((m) => m.authorRole === 'SYSTEM')).toBe(true)
  })

  it('T3 — refuse une décision prise sur une version périmée', async () => {
    const { admin, dispute } = await setup()
    await expectFailure(
      askLearner(dispute.id, admin.id, {
        expectedUpdatedAt: new Date(dispute.updatedAt.getTime() - 60_000).toISOString(),
        question: 'Pouvez-vous préciser votre demande ?',
      }),
      'STALE_DISPUTE',
    )
  })

  // --- T7 : rejet ---

  it('T7/FR2 — le rejet rend les fonds et l’accès, sans toucher au solde', async () => {
    const { admin, dispute, wallet: w, purchase } = await setup()
    const before = await wallet(w.id)
    expect(before!.reservedBalance).toBe(RESERVED)

    const result = await resolveDispute(dispute.id, admin.id, false, {
      expectedUpdatedAt: dispute.updatedAt.toISOString(),
      resolution: 'REJECT',
      note: 'La ressource correspond à la description publiée.',
    })
    expect(result.resolution).toBe('REJECT')

    const after = await wallet(w.id)
    expect(after!.reservedBalance).toBe(0)
    // Rendu, pas débité : le solde est inchangé.
    expect(after!.balance).toBe(before!.balance)

    const reservation = await prisma.fundReservation.findFirst({ where: { disputeId: dispute.id } })
    expect(reservation).toMatchObject({ status: 'RELEASED', debitedAmount: 0, releasedAmount: RESERVED })

    const purchaseAfter = await prisma.purchase.findUnique({ where: { id: purchase.id } })
    expect(purchaseAfter!.accessSuspended).toBe(false)
    expect(purchaseAfter!.accessRestoredAt).not.toBeNull()

    const disputeAfter = await prisma.dispute.findUnique({ where: { id: dispute.id } })
    expect(disputeAfter).toMatchObject({ status: 'RESOLVED_REJECTED', refundStatus: 'NOT_APPLICABLE' })
    expect(disputeAfter!.learnerDeadlineAt).toBeNull()
  })

  // --- T6 : remboursement Stripe (automatique en développement) ---

  it('T6/FR3 — le remboursement intégral débite le solde et lève la réserve', async () => {
    const { admin, dispute, wallet: w, purchase } = await setup({ provider: 'STRIPE' })

    const result = await resolveDispute(dispute.id, admin.id, false, {
      expectedUpdatedAt: dispute.updatedAt.toISOString(),
      resolution: 'FULL_REFUND',
      note: 'Le contenu livré ne correspond pas à la fiche.',
    })
    expect(result.refundStatus).toBe('COMPLETED')

    const after = await wallet(w.id)
    expect(after!.reservedBalance).toBe(0)
    expect(after!.balance).toBe(0) // 17 000 gelés puis débités

    const reservation = await prisma.fundReservation.findFirst({ where: { disputeId: dispute.id } })
    expect(reservation).toMatchObject({ status: 'DEBITED', debitedAmount: RESERVED, releasedAmount: 0 })

    const purchaseAfter = await prisma.purchase.findUnique({ where: { id: purchase.id } })
    expect(purchaseAfter!.refundedAt).not.toBeNull()
    expect(purchaseAfter!.refundAmountFcfa).toBe(AMOUNT)
    expect(purchaseAfter!.providerStatus).toBe('REFUNDED')
    // Décision 18 : un remboursement ne rend pas l'accès.
    expect(purchaseAfter!.accessSuspended).toBe(true)
  })

  it('T6/FR4 — le remboursement partiel ne débite que sa part', async () => {
    const { admin, dispute, wallet: w } = await setup({ provider: 'STRIPE' })

    await resolveDispute(dispute.id, admin.id, false, {
      expectedUpdatedAt: dispute.updatedAt.toISOString(),
      resolution: 'PARTIAL_REFUND',
      refundAmountFcfa: 8000,
      note: 'Seul le module manquant est remboursé.',
    })

    const debited = Math.round(8000 * TRAINER_SHARE_RATE) // 6 800
    const after = await wallet(w.id)
    expect(after!.reservedBalance).toBe(0)
    // Le reste de la réserve revient au formateur.
    expect(after!.balance).toBe(RESERVED - debited)

    const reservation = await prisma.fundReservation.findFirst({ where: { disputeId: dispute.id } })
    expect(reservation).toMatchObject({
      status: 'PARTIALLY_DEBITED',
      debitedAmount: debited,
      releasedAmount: RESERVED - debited,
    })
  })

  it('T6 — refuse un montant partiel absurde', async () => {
    const { admin, dispute } = await setup()
    await expectFailure(
      resolveDispute(dispute.id, admin.id, false, {
        expectedUpdatedAt: dispute.updatedAt.toISOString(),
        resolution: 'PARTIAL_REFUND',
        refundAmountFcfa: AMOUNT,
        note: 'Remboursement partiel égal au total.',
      }),
      'PARTIAL_AMOUNT_INVALID',
    )
  })

  // --- Barème et dérogation ---
  //
  // Un litige ouvert par l'apprenant est par construction dans le barème :
  // `openDispute` refuse au-delà de 14 jours ou de 30 % consultés. Les dossiers
  // hors barème viennent d'ailleurs — chargeback de l'opérateur, ouverture par
  // un administrateur — et n'ont pas subi ces contrôles.
  async function chargebackDispute() {
    const base = await setup()
    const outOfWindow = await prisma.dispute.create({
      data: {
        purchaseId: base.purchase.id,
        learnerId: base.learner.id,
        trainerId: base.trainer.id,
        source: 'STRIPE_CHARGEBACK',
        reason: 'UNAUTHORIZED_CHARGE',
        status: 'OPEN',
        disputedAmountFcfa: AMOUNT,
        // Ouvert bien après la fenêtre de contestation.
        openedAt: new Date(base.purchase.createdAt.getTime() + 40 * DAY),
      },
    })
    return { ...base, dispute: outOfWindow }
  }

  it('hors barème, un modérateur ne peut pas rembourser', async () => {
    const { admin, dispute } = await chargebackDispute()

    await expectFailure(
      resolveDispute(dispute.id, admin.id, false, {
        expectedUpdatedAt: dispute.updatedAt.toISOString(),
        resolution: 'FULL_REFUND',
        note: 'Geste commercial exceptionnel.',
      }),
      'POLICY_OVERRIDE_FORBIDDEN',
    )
  })

  it('hors barème, un super-administrateur doit justifier', async () => {
    const { admin, dispute } = await chargebackDispute()

    await expectFailure(
      resolveDispute(dispute.id, admin.id, true, {
        expectedUpdatedAt: dispute.updatedAt.toISOString(),
        resolution: 'FULL_REFUND',
        note: 'Geste commercial exceptionnel.',
      }),
      'OVERRIDE_JUSTIFICATION_REQUIRED',
    )
  })

  it('hors barème, la dérogation justifiée est tracée', async () => {
    const { admin, dispute } = await chargebackDispute()

    await resolveDispute(dispute.id, admin.id, true, {
      expectedUpdatedAt: dispute.updatedAt.toISOString(),
      resolution: 'FULL_REFUND',
      note: 'Chargeback opérateur : remboursement imposé.',
      overrideJustification: 'Contestation portée par la banque, hors fenêtre NkamVa.',
    })

    const after = await prisma.dispute.findUnique({ where: { id: dispute.id } })
    expect(after!.overrideJustification).toContain('Contestation portée par la banque')

    const log = await prisma.auditLog.findFirst({
      where: { action: 'DISPUTE_REFUND_DECIDED', targetId: dispute.id },
    })
    expect(log!.meta).toMatchObject({ policyOverride: true })
  })

  it('une instruction qui traîne ne fait pas basculer le dossier hors barème', async () => {
    // Ouvert dans les temps, examiné trois semaines plus tard : le droit de
    // l'apprenant était acquis au moment où il a contesté.
    const { admin, dispute, purchase } = await setup({ purchasedDaysAgo: 12 })
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: { createdAt: new Date(Date.now() - 33 * DAY) },
    })
    await prisma.dispute.update({
      where: { id: dispute.id },
      data: { openedAt: new Date(Date.now() - 21 * DAY) },
    })
    const fresh = (await prisma.dispute.findUnique({ where: { id: dispute.id } }))!

    const result = await resolveDispute(dispute.id, admin.id, false, {
      expectedUpdatedAt: fresh.updatedAt.toISOString(),
      resolution: 'FULL_REFUND',
      note: 'Contenu non conforme à la description.',
    })
    expect(result.resolution).toBe('FULL_REFUND')
  })

  it('dans le barème, aucune justification n’est demandée', async () => {
    const { admin, dispute } = await setup({ purchasedDaysAgo: 3, watchedSeconds: 300 })

    const result = await resolveDispute(dispute.id, admin.id, false, {
      expectedUpdatedAt: dispute.updatedAt.toISOString(),
      resolution: 'FULL_REFUND',
      note: 'Contenu non conforme à la description.',
    })
    expect(result.resolution).toBe('FULL_REFUND')
    expect(
      (await prisma.dispute.findUnique({ where: { id: dispute.id } }))!.overrideJustification,
    ).toBeNull()
  })

  // --- Décision 17 ---

  it('refuse de rembourser pendant un chargeback en cours', async () => {
    const { admin, dispute, purchase, wallet: w } = await setup()
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: { providerDisputeActive: true },
    })
    const fresh = (await prisma.dispute.findUnique({ where: { id: dispute.id } }))!

    await expectFailure(
      resolveDispute(dispute.id, admin.id, false, {
        expectedUpdatedAt: fresh.updatedAt.toISOString(),
        resolution: 'FULL_REFUND',
        note: 'Contenu non conforme à la description.',
      }),
      'PROVIDER_DISPUTE_ACTIVE',
    )
    // Rien n'a bougé : ni la réserve, ni le solde.
    const after = await wallet(w.id)
    expect(after!.reservedBalance).toBe(RESERVED)
    expect(after!.balance).toBe(RESERVED)
  })

  // --- Remboursement manuel (CinetPay) ---

  it('CinetPay — la décision crée une tâche et ne débite rien tout de suite', async () => {
    const { admin, dispute, wallet: w } = await setup({ provider: 'CINETPAY' })

    const result = await resolveDispute(dispute.id, admin.id, false, {
      expectedUpdatedAt: dispute.updatedAt.toISOString(),
      resolution: 'FULL_REFUND',
      note: 'Contenu non conforme à la description.',
    })
    expect(result).toMatchObject({ refundStatus: 'PENDING', manualTaskCreated: true })

    // Tant que l'argent n'est pas rendu, la réserve tient et le solde est intact.
    const after = await wallet(w.id)
    expect(after!.reservedBalance).toBe(RESERVED)
    expect(after!.balance).toBe(RESERVED)

    const tasks = await listManualRefundTasks('PENDING')
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ provider: 'CINETPAY', refundAmountFcfa: AMOUNT, trainerDebitFcfa: RESERVED })
  })

  it('CinetPay — confirmer la tâche débite enfin le formateur', async () => {
    const { admin, dispute, wallet: w, purchase } = await setup({ provider: 'CINETPAY' })
    await resolveDispute(dispute.id, admin.id, false, {
      expectedUpdatedAt: dispute.updatedAt.toISOString(),
      resolution: 'FULL_REFUND',
      note: 'Contenu non conforme à la description.',
    })
    const task = (await listManualRefundTasks('PENDING'))[0]

    await completeManualRefundTask(task.id, admin.id, 'Virement mobile money effectué.')

    const after = await wallet(w.id)
    expect(after!.reservedBalance).toBe(0)
    expect(after!.balance).toBe(0)
    expect((await prisma.purchase.findUnique({ where: { id: purchase.id } }))!.refundedAt).not.toBeNull()
    expect((await prisma.dispute.findUnique({ where: { id: dispute.id } }))!.refundStatus).toBe('COMPLETED')
  })

  it('FR5 — annuler la tâche rend les fonds gelés au formateur', async () => {
    const { admin, dispute, wallet: w, purchase } = await setup({ provider: 'CINETPAY' })
    await resolveDispute(dispute.id, admin.id, false, {
      expectedUpdatedAt: dispute.updatedAt.toISOString(),
      resolution: 'FULL_REFUND',
      note: 'Contenu non conforme à la description.',
    })
    const task = (await listManualRefundTasks('PENDING'))[0]

    await cancelManualRefundTask(task.id, admin.id, 'Numéro mobile money invalide, remboursement impossible.')

    const after = await wallet(w.id)
    expect(after!.reservedBalance).toBe(0)
    // Aucun débit : le remboursement n'a pas eu lieu.
    expect(after!.balance).toBe(RESERVED)
    expect((await prisma.dispute.findUnique({ where: { id: dispute.id } }))!.refundStatus).toBe('FAILED')
    // L'accès reste suspendu : la décision de rembourser n'est pas annulée.
    expect((await prisma.purchase.findUnique({ where: { id: purchase.id } }))!.accessSuspended).toBe(true)
  })

  it('une tâche déjà traitée ne se rejoue pas', async () => {
    const { admin, dispute } = await setup({ provider: 'CINETPAY' })
    await resolveDispute(dispute.id, admin.id, false, {
      expectedUpdatedAt: dispute.updatedAt.toISOString(),
      resolution: 'FULL_REFUND',
      note: 'Contenu non conforme à la description.',
    })
    const task = (await listManualRefundTasks('PENDING'))[0]

    await completeManualRefundTask(task.id, admin.id)
    await expectFailure(completeManualRefundTask(task.id, admin.id), 'TASK_NOT_PENDING')
  })

  it('un dossier clos ne se rejuge pas', async () => {
    const { admin, dispute } = await setup()
    await resolveDispute(dispute.id, admin.id, false, {
      expectedUpdatedAt: dispute.updatedAt.toISOString(),
      resolution: 'REJECT',
      note: 'La ressource correspond à la description publiée.',
    })
    const fresh = (await prisma.dispute.findUnique({ where: { id: dispute.id } }))!

    await expectFailure(
      resolveDispute(dispute.id, admin.id, false, {
        expectedUpdatedAt: fresh.updatedAt.toISOString(),
        resolution: 'FULL_REFUND',
        note: 'Changement d’avis après coup.',
      }),
      'DISPUTE_CLOSED',
    )
  })

  it('exige un motif exploitable', async () => {
    const { admin, dispute } = await setup()
    await expectFailure(
      resolveDispute(dispute.id, admin.id, false, {
        expectedUpdatedAt: dispute.updatedAt.toISOString(),
        resolution: 'REJECT',
        note: 'non',
      }),
      'RESOLUTION_NOTE_REQUIRED',
    )
  })

  it('compte les dossiers par état', async () => {
    const { admin, dispute } = await setup()
    await setup()
    await resolveDispute(dispute.id, admin.id, false, {
      expectedUpdatedAt: dispute.updatedAt.toISOString(),
      resolution: 'REJECT',
      note: 'La ressource correspond à la description publiée.',
    })

    expect(await getDisputeStats()).toMatchObject({ open: 1, rejected: 1 })
  })
})
