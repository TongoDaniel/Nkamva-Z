// ==========================================================================
// Job d'auto-clôture des litiges (T8)
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { openDispute, postLearnerMessage, TRAINER_SHARE_RATE } from '@/lib/disputes'
import { askLearner } from '@/lib/dispute-review'
import { autoCloseDisputes } from '@/lib/jobs/auto-close-disputes'
import { JOBS, runJob } from '@/lib/jobs'

const DAY = 86_400_000
const AMOUNT = 20_000
const RESERVED = Math.round(AMOUNT * TRAINER_SHARE_RATE)

describe('Job — auto-clôture des litiges', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  /** Un litige mis en attente de l'apprenant, avec une échéance contrôlée. */
  async function waitingDispute(deadlineDaysFromNow: number) {
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
        platformShareFcfa: AMOUNT - RESERVED, provider: 'CINETPAY',
        providerTransactionId: `cp_${crypto.randomUUID()}`, providerStatus: 'SUCCEEDED',
        createdAt: new Date(Date.now() - 2 * DAY),
      },
    })
    const dispute = await openDispute(learner.id, {
      purchaseId: purchase.id,
      reason: 'CONTENT_MISMATCH',
      reasonDetail: 'Le contenu ne correspond pas à la fiche produit.',
    })
    const fresh = (await prisma.dispute.findUnique({ where: { id: dispute.id } }))!
    await askLearner(dispute.id, admin.id, {
      expectedUpdatedAt: fresh.updatedAt.toISOString(),
      question: 'Pouvez-vous préciser ce qui manque par rapport à la fiche ?',
    })
    // L'échéance posée par askLearner est à sept jours : on la déplace pour
    // exercer le job sans attendre.
    await prisma.dispute.update({
      where: { id: dispute.id },
      data: { learnerDeadlineAt: new Date(Date.now() + deadlineDaysFromNow * DAY) },
    })

    return { wallet, learner, admin, purchase, disputeId: dispute.id }
  }

  const wallet = (id: string) => prisma.wallet.findUnique({ where: { id } })

  it('T8 — clôt un dossier échu, rend les fonds et rétablit l’accès', async () => {
    const { wallet: w, purchase, disputeId } = await waitingDispute(-1)
    expect((await wallet(w.id))!.reservedBalance).toBe(RESERVED)

    const result = await autoCloseDisputes()
    expect(result).toMatchObject({ eligible: 1, closed: 1, failed: 0 })

    const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } })
    expect(dispute).toMatchObject({
      status: 'RESOLVED_AUTO',
      resolution: 'AUTO_TIMEOUT',
      refundStatus: 'NOT_APPLICABLE',
    })
    // Personne n'a tranché : le dossier se referme sans décideur.
    expect(dispute!.resolvedById).toBeNull()
    expect(dispute!.learnerDeadlineAt).toBeNull()

    const after = await wallet(w.id)
    expect(after!.reservedBalance).toBe(0)
    // Rendus, pas débités : aucune décision n'a été prise au fond.
    expect(after!.balance).toBe(RESERVED)

    const reservation = await prisma.fundReservation.findFirst({ where: { disputeId } })
    expect(reservation).toMatchObject({ status: 'RELEASED', debitedAmount: 0, releasedAmount: RESERVED })

    const purchaseAfter = await prisma.purchase.findUnique({ where: { id: purchase.id } })
    expect(purchaseAfter!.accessSuspended).toBe(false)
    expect(purchaseAfter!.accessRestoredAt).not.toBeNull()
  })

  it('T8 — la clôture est expliquée dans le fil et tracée', async () => {
    const { disputeId } = await waitingDispute(-1)
    await autoCloseDisputes()

    const messages = await prisma.disputeMessage.findMany({
      where: { disputeId, authorRole: 'SYSTEM' },
      orderBy: { createdAt: 'asc' },
    })
    // Le premier annonçait l'échéance, le second acte la clôture.
    expect(messages.length).toBeGreaterThanOrEqual(2)
    expect(messages.at(-1)!.body).toContain('clos automatiquement')

    const event = await prisma.disputeReviewEvent.findFirst({
      where: { disputeId, toStatus: 'RESOLVED_AUTO' },
    })
    expect(event).toMatchObject({ fromStatus: 'WAITING_LEARNER', actorRole: 'SYSTEM' })
    expect(
      await prisma.auditLog.count({ where: { action: 'DISPUTE_AUTO_CLOSED', targetId: disputeId } }),
    ).toBe(1)
  })

  it('épargne un dossier dont le délai court encore', async () => {
    const { wallet: w, disputeId } = await waitingDispute(3)

    expect(await autoCloseDisputes()).toMatchObject({ eligible: 0, closed: 0 })
    expect((await prisma.dispute.findUnique({ where: { id: disputeId } }))!.status).toBe('WAITING_LEARNER')
    expect((await wallet(w.id))!.reservedBalance).toBe(RESERVED)
  })

  it('ne touche pas un dossier qui n’attend pas de réponse', async () => {
    const { disputeId } = await waitingDispute(-1)
    // Le support reprend la main avant que le job ne passe.
    await prisma.dispute.update({ where: { id: disputeId }, data: { status: 'IN_REVIEW' } })

    expect(await autoCloseDisputes()).toMatchObject({ eligible: 0, closed: 0 })
    expect((await prisma.dispute.findUnique({ where: { id: disputeId } }))!.status).toBe('IN_REVIEW')
  })

  it('respecte une réponse arrivée avant le passage du job', async () => {
    const { learner, disputeId, wallet: w } = await waitingDispute(-1)

    // L'apprenant répond in extremis : sa réponse efface l'échéance.
    await postLearnerMessage(disputeId, learner.id, 'Voici la capture demandée, avec le détail.')

    expect(await autoCloseDisputes()).toMatchObject({ eligible: 0, closed: 0 })
    const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } })
    expect(dispute!.status).toBe('IN_REVIEW')
    // Les fonds restent gelés : le dossier est vivant.
    expect((await wallet(w.id))!.reservedBalance).toBe(RESERVED)
  })

  it('est idempotent : une seconde passe ne retrouve rien à faire', async () => {
    const { disputeId, wallet: w } = await waitingDispute(-1)

    expect((await autoCloseDisputes()).closed).toBe(1)
    expect(await autoCloseDisputes()).toMatchObject({ eligible: 0, closed: 0, failed: 0 })

    // Pas de double libération : la réserve ne descend pas sous zéro.
    expect((await wallet(w.id))!.reservedBalance).toBe(0)
    expect(
      await prisma.auditLog.count({ where: { action: 'DISPUTE_AUTO_CLOSED', targetId: disputeId } }),
    ).toBe(1)
  })

  it('clôt plusieurs dossiers échus en une passe', async () => {
    await waitingDispute(-1)
    await waitingDispute(-5)
    await waitingDispute(2)

    expect(await autoCloseDisputes()).toMatchObject({ eligible: 2, closed: 2, failed: 0 })
    expect(await prisma.dispute.count({ where: { status: 'WAITING_LEARNER' } })).toBe(1)
  })

  it('journalise son issue quand il passe par l’ordonnanceur', async () => {
    await waitingDispute(-1)
    const job = JOBS.find((j) => j.id === 'auto-close-disputes')!

    await runJob(job)

    const log = await prisma.auditLog.findFirst({
      where: { action: 'SCHEDULED_JOB_COMPLETED', targetId: 'auto-close-disputes' },
    })
    expect(log!.meta).toMatchObject({ eligible: 1, closed: 1, failed: 0 })
  })
})
