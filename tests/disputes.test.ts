// ==========================================================================
// Lot 2 — Ouverture d'un litige et fil de discussion (T1, T4, FR1)
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  openDispute,
  postLearnerMessage,
  getMyDispute,
  getDisputeEligibility,
  assessConsumption,
  assessEligibility,
  TRAINER_SHARE_RATE,
  DISPUTE_WINDOW_DAYS,
} from '@/lib/disputes'

const DAY = 86_400_000

async function expectFailure(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toThrow(code)
}

// --- Règle de remboursement, isolée de la base ---

describe('Règle de remboursement', () => {
  const video = (watched: number, duration = 3600) =>
    assessConsumption({ format: 'video', durationSeconds: duration, watchedSeconds: watched, downloaded: false })

  it('mesure la part consultée d’un format streamé', () => {
    expect(video(0).consumptionPercent).toBe(0)
    expect(video(1080).consumptionPercent).toBe(30)
    expect(video(3600).consumptionPercent).toBe(100)
    expect(video(0).ruleApplies).toBe(true)
  })

  it('traite un format téléchargeable comme binaire', () => {
    const kit = assessConsumption({
      format: 'pdf', durationSeconds: null, watchedSeconds: 0, downloaded: true,
    })
    // Une fois le fichier récupéré, la part consultée n'a plus de sens.
    expect(kit.ruleApplies).toBe(false)
    expect(kit.consumptionPercent).toBe(100)
    expect(kit.downloaded).toBe(true)
  })

  it('accepte une contestation dans les délais et sous le seuil', () => {
    const verdict = assessEligibility({
      purchasedAt: new Date(Date.now() - 3 * DAY),
      assessment: video(600),
    })
    expect(verdict.eligible).toBe(true)
  })

  it('refuse au-delà de quatorze jours', () => {
    const verdict = assessEligibility({
      purchasedAt: new Date(Date.now() - (DISPUTE_WINDOW_DAYS + 1) * DAY),
      assessment: video(0),
    })
    expect(verdict).toMatchObject({ eligible: false, reason: 'WINDOW_EXPIRED' })
  })

  it('refuse à partir de 30 % consultés, pas avant', () => {
    const at29 = assessEligibility({ purchasedAt: new Date(), assessment: video(1044) })
    expect(at29.eligible).toBe(true)
    const at30 = assessEligibility({ purchasedAt: new Date(), assessment: video(1080) })
    expect(at30).toMatchObject({ eligible: false, reason: 'CONSUMPTION_EXCEEDED' })
  })

  it('refuse une ressource téléchargée, quelle que soit la date', () => {
    const verdict = assessEligibility({
      purchasedAt: new Date(),
      assessment: assessConsumption({
        format: 'kit', durationSeconds: null, watchedSeconds: 0, downloaded: true,
      }),
    })
    expect(verdict).toMatchObject({ eligible: false, reason: 'RESOURCE_DOWNLOADED' })
  })
})

// --- Ouverture, contre la base ---

describe('Lot 2 — Ouverture d’un litige', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup(opts: {
    format?: string
    durationSeconds?: number | null
    purchasedDaysAgo?: number
    watchedSeconds?: number
    downloaded?: boolean
    amountFcfa?: number
  } = {}) {
    const amountFcfa = opts.amountFcfa ?? 20000
    const trainerUser = await prisma.user.create({ data: { email: `t-${crypto.randomUUID()}@test.com`, role: 'TRAINER' } })
    const trainer = await prisma.trainerProfile.create({ data: { userId: trainerUser.id } })
    const wallet = await prisma.wallet.create({
      data: { trainerId: trainer.id, balance: Math.round(amountFcfa * TRAINER_SHARE_RATE) },
    })
    const learner = await prisma.user.create({ data: { email: `l-${crypto.randomUUID()}@test.com` } })
    const course = await prisma.course.create({
      data: {
        trainerId: trainer.id, slug: `c-${crypto.randomUUID()}`, title: 'Masterclass DDD',
        blurb: 'Accroche', description: 'Description', category: 'Développement',
        format: opts.format ?? 'video', priceFcfa: amountFcfa, status: 'published',
        publishedAt: new Date(), durationSeconds: opts.durationSeconds ?? 3600,
      },
    })
    const purchase = await prisma.purchase.create({
      data: {
        learnerId: learner.id, trainerId: trainer.id, courseId: course.id,
        amountFcfa, commissionRate: 0.15,
        trainerShareFcfa: Math.round(amountFcfa * TRAINER_SHARE_RATE),
        platformShareFcfa: amountFcfa - Math.round(amountFcfa * TRAINER_SHARE_RATE),
        provider: 'CINETPAY', providerTransactionId: `cp_${crypto.randomUUID()}`,
        providerStatus: 'SUCCEEDED',
        createdAt: new Date(Date.now() - (opts.purchasedDaysAgo ?? 2) * DAY),
      },
    })
    if (opts.watchedSeconds || opts.downloaded) {
      await prisma.courseView.create({
        data: {
          courseId: course.id, learnerId: learner.id,
          watchedSeconds: opts.watchedSeconds ?? 0, downloaded: opts.downloaded ?? false,
        },
      })
    }
    return { trainer, wallet, learner, course, purchase, amountFcfa }
  }

  const OPEN = { reason: 'CONTENT_MISMATCH' as const, reasonDetail: 'Le contenu ne correspond pas à la fiche.' }

  it('T1/FR1 — gèle la part du formateur sans la lui retirer, et suspend l’accès', async () => {
    const { wallet, learner, purchase, amountFcfa } = await setup()
    const balanceBefore = (await prisma.wallet.findUnique({ where: { id: wallet.id } }))!.balance

    const dispute = await openDispute(learner.id, { purchaseId: purchase.id, ...OPEN })
    expect(dispute.status).toBe('OPEN')
    expect(dispute.disputedAmountFcfa).toBe(amountFcfa)

    const reserved = Math.round(amountFcfa * TRAINER_SHARE_RATE)
    const reservation = await prisma.fundReservation.findFirst({ where: { disputeId: dispute.id } })
    expect(reservation).toMatchObject({ status: 'ACTIVE', reservedAmountFcfa: reserved, debitedAmount: 0 })

    const after = await prisma.wallet.findUnique({ where: { id: wallet.id } })
    // Gelé, pas débité : le solde est intact, la réserve a monté.
    expect(after!.balance).toBe(balanceBefore)
    expect(after!.reservedBalance).toBe(reserved)

    // Décision 18 : la suspension vit sur l'achat.
    const purchaseAfter = await prisma.purchase.findUnique({ where: { id: purchase.id } })
    expect(purchaseAfter!.accessSuspended).toBe(true)
    expect(purchaseAfter!.accessSuspendedAt).not.toBeNull()
  })

  it('T1 — la réserve porte sur la part formateur, pas sur le prix payé', async () => {
    const { wallet, learner, purchase } = await setup({ amountFcfa: 10000 })
    await openDispute(learner.id, { purchaseId: purchase.id, ...OPEN })

    // 10 000 payés, 8 500 versés au formateur : la commission n'est pas chez lui.
    expect((await prisma.wallet.findUnique({ where: { id: wallet.id } }))!.reservedBalance).toBe(8500)
  })

  it('T1 — fige la consommation au moment de l’ouverture', async () => {
    const { learner, purchase } = await setup({ watchedSeconds: 540 })

    const dispute = await openDispute(learner.id, { purchaseId: purchase.id, ...OPEN })

    const snapshot = await prisma.consumptionSnapshot.findUnique({ where: { disputeId: dispute.id } })
    expect(snapshot).toMatchObject({ consumptionPercent: 15, ruleApplies: true, watchedSeconds: 540 })

    // Une consultation postérieure ne doit pas altérer le constat.
    await prisma.courseView.updateMany({
      where: { learnerId: learner.id },
      data: { watchedSeconds: 3600 },
    })
    const again = await prisma.consumptionSnapshot.findUnique({ where: { disputeId: dispute.id } })
    expect(again!.consumptionPercent).toBe(15)
  })

  it('T1 — le détail du motif ouvre le fil de discussion', async () => {
    const { learner, purchase } = await setup()
    const dispute = await openDispute(learner.id, { purchaseId: purchase.id, ...OPEN })

    const messages = await prisma.disputeMessage.findMany({ where: { disputeId: dispute.id } })
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ authorRole: 'LEARNER', body: OPEN.reasonDetail })
  })

  it('T1 — refuse un achat hors délai, sans rien geler', async () => {
    const { wallet, learner, purchase } = await setup({ purchasedDaysAgo: DISPUTE_WINDOW_DAYS + 2 })

    await expectFailure(openDispute(learner.id, { purchaseId: purchase.id, ...OPEN }), 'WINDOW_EXPIRED')
    expect((await prisma.wallet.findUnique({ where: { id: wallet.id } }))!.reservedBalance).toBe(0)
    expect((await prisma.purchase.findUnique({ where: { id: purchase.id } }))!.accessSuspended).toBe(false)
  })

  it('T1 — refuse au-delà de 30 % consultés', async () => {
    const { learner, purchase } = await setup({ watchedSeconds: 2000 })
    await expectFailure(openDispute(learner.id, { purchaseId: purchase.id, ...OPEN }), 'CONSUMPTION_EXCEEDED')
  })

  it('T1 — refuse une ressource téléchargée', async () => {
    const { learner, purchase } = await setup({ format: 'pdf', durationSeconds: null, downloaded: true })
    await expectFailure(openDispute(learner.id, { purchaseId: purchase.id, ...OPEN }), 'RESOURCE_DOWNLOADED')
  })

  it('T1 — refuse une seconde contestation sur le même achat', async () => {
    const { learner, purchase } = await setup()
    await openDispute(learner.id, { purchaseId: purchase.id, ...OPEN })
    await expectFailure(openDispute(learner.id, { purchaseId: purchase.id, ...OPEN }), 'DISPUTE_ALREADY_OPEN')
  })

  it('T1 — autorise une nouvelle contestation une fois la précédente close', async () => {
    const { learner, purchase } = await setup()
    const first = await openDispute(learner.id, { purchaseId: purchase.id, ...OPEN })
    await prisma.dispute.update({
      where: { id: first.id },
      data: { status: 'RESOLVED_REJECTED', resolution: 'REJECT', resolvedAt: new Date() },
    })

    const second = await openDispute(learner.id, { purchaseId: purchase.id, ...OPEN })
    expect(second.id).not.toBe(first.id)
  })

  it('T1 — refuse l’achat d’autrui', async () => {
    const { purchase } = await setup()
    const intruder = await prisma.user.create({ data: { email: 'intrus@test.com' } })
    await expectFailure(openDispute(intruder.id, { purchaseId: purchase.id, ...OPEN }), 'PURCHASE_NOT_FOUND')
  })

  it('T1 — refuse un achat déjà remboursé', async () => {
    const { learner, purchase } = await setup()
    await prisma.purchase.update({ where: { id: purchase.id }, data: { refundedAt: new Date() } })
    await expectFailure(openDispute(learner.id, { purchaseId: purchase.id, ...OPEN }), 'ALREADY_REFUNDED')
  })

  it('expose la recevabilité avant d’ouvrir', async () => {
    const { learner, purchase } = await setup({ watchedSeconds: 2000 })
    const { verdict } = await getDisputeEligibility(purchase.id, learner.id)
    expect(verdict).toMatchObject({ eligible: false, reason: 'CONSUMPTION_EXCEEDED' })
    expect(verdict.assessment.consumptionPercent).toBe(56)
  })

  // --- T4 ---

  it('T4 — répondre lève l’attente et son échéance', async () => {
    const { learner, purchase } = await setup()
    const dispute = await openDispute(learner.id, { purchaseId: purchase.id, ...OPEN })
    await prisma.dispute.update({
      where: { id: dispute.id },
      data: {
        status: 'WAITING_LEARNER',
        learnerDeadlineAt: new Date(Date.now() + 7 * DAY),
      },
    })

    await postLearnerMessage(dispute.id, learner.id, 'Voici la capture demandée.')

    const after = await prisma.dispute.findUnique({ where: { id: dispute.id } })
    expect(after!.status).toBe('IN_REVIEW')
    // Sans cette remise à zéro, le job d'auto-clôture fermerait un dossier vivant.
    expect(after!.learnerDeadlineAt).toBeNull()

    const event = await prisma.disputeReviewEvent.findFirst({ where: { disputeId: dispute.id } })
    expect(event).toMatchObject({ fromStatus: 'WAITING_LEARNER', toStatus: 'IN_REVIEW' })
  })

  it('T4 — un message hors attente ne change pas l’état', async () => {
    const { learner, purchase } = await setup()
    const dispute = await openDispute(learner.id, { purchaseId: purchase.id, ...OPEN })

    await postLearnerMessage(dispute.id, learner.id, 'Un complément d’information.')
    expect((await prisma.dispute.findUnique({ where: { id: dispute.id } }))!.status).toBe('OPEN')
  })

  it('T4 — refuse d’écrire dans un dossier clos ou chez autrui', async () => {
    const { learner, purchase } = await setup()
    const dispute = await openDispute(learner.id, { purchaseId: purchase.id, ...OPEN })
    const intruder = await prisma.user.create({ data: { email: 'intrus2@test.com' } })

    await expectFailure(postLearnerMessage(dispute.id, intruder.id, 'Bonjour'), 'DISPUTE_NOT_FOUND')

    await prisma.dispute.update({
      where: { id: dispute.id },
      data: { status: 'RESOLVED_REJECTED', resolution: 'REJECT' },
    })
    await expectFailure(postLearnerMessage(dispute.id, learner.id, 'Encore un mot'), 'DISPUTE_CLOSED')
  })

  it('ouvrir le fil marque les messages du support comme lus', async () => {
    const { learner, purchase } = await setup()
    const dispute = await openDispute(learner.id, { purchaseId: purchase.id, ...OPEN })
    await prisma.disputeMessage.create({
      data: { disputeId: dispute.id, authorRole: 'SUPPORT', body: 'Pouvez-vous préciser ?', readByLearner: false },
    })

    await getMyDispute(dispute.id, learner.id)

    expect(
      await prisma.disputeMessage.count({ where: { disputeId: dispute.id, authorRole: 'SUPPORT', readByLearner: false } }),
    ).toBe(0)
  })

  it('le litige d’autrui est introuvable, pas interdit', async () => {
    const { learner, purchase } = await setup()
    const dispute = await openDispute(learner.id, { purchaseId: purchase.id, ...OPEN })
    const intruder = await prisma.user.create({ data: { email: 'intrus3@test.com' } })

    expect(await getMyDispute(dispute.id, intruder.id)).toBeNull()
  })

  it('prévient la modération, jamais les finances', async () => {
    const moderator = await prisma.user.create({
      data: { email: 'mod@test.com', role: 'ADMIN', adminRole: 'MODERATION' },
    })
    const finance = await prisma.user.create({
      data: { email: 'fin@test.com', role: 'ADMIN', adminRole: 'FINANCES' },
    })
    const { learner, purchase } = await setup()

    await openDispute(learner.id, { purchaseId: purchase.id, ...OPEN })

    expect(await prisma.notification.count({ where: { userId: moderator.id } })).toBe(1)
    expect(await prisma.notification.count({ where: { userId: finance.id } })).toBe(0)
  })
})
