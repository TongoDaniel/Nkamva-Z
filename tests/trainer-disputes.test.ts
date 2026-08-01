// ==========================================================================
// Lot 2 — Litiges vus par le formateur, et sa contestation (décision 19)
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { openDispute, getMyDispute, TRAINER_SHARE_RATE } from '@/lib/disputes'
import { getDisputeForReview, resolveDispute } from '@/lib/dispute-review'
import {
  listTrainerDisputes,
  getTrainerDispute,
  contestDispute,
  resolveSupportTicket,
  getFrozenTotal,
} from '@/lib/trainer-disputes'

const DAY = 86_400_000
const AMOUNT = 20_000
const RESERVED = Math.round(AMOUNT * TRAINER_SHARE_RATE)
const DETAIL = "J'ai payé pour un module qui n'existe pas dans la ressource livrée."

async function expectFailure(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toThrow(code)
}

describe('Lot 2 — Litiges côté formateur', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup() {
    const trainerUser = await prisma.user.create({
      data: { email: `t-${crypto.randomUUID()}@test.com`, fullName: 'Aminata Sow', role: 'TRAINER' },
    })
    const trainer = await prisma.trainerProfile.create({ data: { userId: trainerUser.id } })
    await prisma.wallet.create({ data: { trainerId: trainer.id, balance: RESERVED } })
    const learner = await prisma.user.create({
      data: { email: `l-${crypto.randomUUID()}@test.com`, fullName: 'Kwame Mensah' },
    })
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
      reasonDetail: DETAIL,
    })
    return { trainerUser, trainer, learner, admin, course, purchase, disputeId: dispute.id }
  }

  // --- Décision 19 ---

  it('le formateur voit le motif et la ressource, jamais le détail ni l’apprenant', async () => {
    const { trainer, disputeId } = await setup()

    const dispute = await getTrainerDispute(disputeId, trainer.id)
    expect(dispute).not.toBeNull()
    expect(dispute!.reason).toBe('CONTENT_MISMATCH')
    expect(dispute!.purchase.course!.title).toBe('Masterclass DDD')

    // Le détail rédigé par l'apprenant ne doit apparaître nulle part.
    const serialized = JSON.stringify(dispute)
    expect(serialized).not.toContain(DETAIL)
    expect(serialized).not.toContain('Kwame Mensah')
    // Ni le fil de discussion, ni le constat de consommation.
    expect(serialized).not.toContain('consumptionSnapshot')
    expect(serialized).not.toContain('messages')
  })

  it('la liste n’expose pas davantage que le détail', async () => {
    const { trainer } = await setup()

    const { items, total } = await listTrainerDisputes(trainer.id)
    expect(total).toBe(1)
    const serialized = JSON.stringify(items)
    expect(serialized).not.toContain(DETAIL)
    expect(serialized).not.toContain('Kwame Mensah')
    expect(serialized).toContain('Masterclass DDD')
  })

  it('le formateur voit ce qui est gelé chez lui', async () => {
    const { trainer, disputeId } = await setup()

    const dispute = await getTrainerDispute(disputeId, trainer.id)
    expect(dispute!.fundReservations[0]).toMatchObject({
      status: 'ACTIVE',
      reservedAmountFcfa: RESERVED,
    })
    expect(await getFrozenTotal(trainer.id)).toBe(RESERVED)
  })

  it('le litige d’un autre formateur est introuvable', async () => {
    const { disputeId } = await setup()
    const otherUser = await prisma.user.create({ data: { email: 'autre@test.com', role: 'TRAINER' } })
    const other = await prisma.trainerProfile.create({ data: { userId: otherUser.id } })

    expect(await getTrainerDispute(disputeId, other.id)).toBeNull()
    expect((await listTrainerDisputes(other.id)).total).toBe(0)
  })

  // --- Contestation ---

  it('la contestation crée un ticket et remonte le dossier dans la file', async () => {
    const { trainerUser, trainer, disputeId } = await setup()
    const before = (await prisma.dispute.findUnique({ where: { id: disputeId } }))!.lastActivityAt

    const ticket = await contestDispute(
      disputeId, trainerUser.id, trainer.id,
      'Le module en question figure bien dans le programme, à la leçon 7.',
    )
    expect(ticket).toMatchObject({ status: 'OPEN' })

    const after = (await prisma.dispute.findUnique({ where: { id: disputeId } }))!
    // Une contestation appelle un examen : le dossier ne doit pas rester au fond.
    expect(after.lastActivityAt.getTime()).toBeGreaterThanOrEqual(before.getTime())

    expect(
      await prisma.auditLog.count({ where: { action: 'DISPUTE_CONTESTED_BY_TRAINER', targetId: disputeId } }),
    ).toBe(1)
  })

  it('la contestation n’entre pas dans le fil que lit l’apprenant', async () => {
    const { trainerUser, trainer, learner, disputeId } = await setup()
    const argument = 'Le module figure bien à la leçon 7, capture à l’appui.'

    await contestDispute(disputeId, trainerUser.id, trainer.id, argument)

    // C'est le cœur de la confidentialité symétrique : l'apprenant ne voit pas
    // la défense du formateur, comme le formateur ne voit pas son motif.
    const learnerView = await getMyDispute(disputeId, learner.id)
    expect(JSON.stringify(learnerView)).not.toContain(argument)
    expect(await prisma.disputeMessage.count({ where: { disputeId } })).toBe(1)
  })

  it('la modération reçoit la contestation dans le dossier', async () => {
    const { trainerUser, trainer, admin, disputeId } = await setup()
    const argument = 'Le module figure bien à la leçon 7, capture à l’appui.'

    await contestDispute(disputeId, trainerUser.id, trainer.id, argument)

    const review = await getDisputeForReview(disputeId)
    expect(review!.supportTickets).toHaveLength(1)
    expect(review!.supportTickets[0]).toMatchObject({ reason: argument, status: 'OPEN' })
    expect(review!.supportTickets[0].trainer.fullName).toBe('Aminata Sow')

    expect(await prisma.notification.count({ where: { userId: admin.id, type: 'DISPUTE_TRAINER_CONTEST' } })).toBe(1)
  })

  it('une seule contestation ouverte à la fois', async () => {
    const { trainerUser, trainer, disputeId } = await setup()
    await contestDispute(disputeId, trainerUser.id, trainer.id, 'Premier argument circonstancié sur ce dossier.')

    await expectFailure(
      contestDispute(disputeId, trainerUser.id, trainer.id, 'Second argument envoyé dans la foulée.'),
      'CONTEST_ALREADY_OPEN',
    )
  })

  it('refuse de contester le litige d’un autre formateur', async () => {
    const { disputeId } = await setup()
    const otherUser = await prisma.user.create({ data: { email: 'autre2@test.com', role: 'TRAINER' } })
    const other = await prisma.trainerProfile.create({ data: { userId: otherUser.id } })

    await expectFailure(
      contestDispute(disputeId, otherUser.id, other.id, 'Je conteste un dossier qui ne me concerne pas.'),
      'DISPUTE_NOT_FOUND',
    )
  })

  it('exige des éléments exploitables', async () => {
    const { trainerUser, trainer, disputeId } = await setup()
    await expectFailure(contestDispute(disputeId, trainerUser.id, trainer.id, 'non'), 'CONTEST_TOO_SHORT')
  })

  it('la contestation reste possible après la décision', async () => {
    const { trainerUser, trainer, admin, disputeId } = await setup()
    const fresh = (await prisma.dispute.findUnique({ where: { id: disputeId } }))!
    await resolveDispute(disputeId, admin.id, false, {
      expectedUpdatedAt: fresh.updatedAt.toISOString(),
      resolution: 'FULL_REFUND',
      note: 'Contenu non conforme à la description publiée.',
    })

    // Un formateur débité doit pouvoir contester la décision, pas seulement
    // l'instruction.
    const ticket = await contestDispute(
      disputeId, trainerUser.id, trainer.id,
      'Je conteste ce remboursement : le module contesté figure au programme.',
    )
    expect(ticket.status).toBe('OPEN')
  })

  // --- Réponse de la modération ---

  it('la modération répond et le formateur en est averti', async () => {
    const { trainerUser, trainer, admin, disputeId } = await setup()
    const ticket = await contestDispute(
      disputeId, trainerUser.id, trainer.id, 'Le module figure bien à la leçon 7.',
    )

    await resolveSupportTicket(ticket.id, admin.id, 'Vérification faite : la leçon 7 traite un autre sujet.')

    const after = await prisma.supportTicket.findUnique({ where: { id: ticket.id } })
    expect(after).toMatchObject({ status: 'RESOLVED', resolvedById: admin.id })
    expect(after!.resolutionNote).toContain('Vérification faite')

    expect(
      await prisma.notification.count({ where: { userId: trainerUser.id, type: 'DISPUTE_CONTEST_ANSWERED' } }),
    ).toBe(1)

    // Une fois répondu, le formateur peut contester à nouveau.
    const second = await contestDispute(
      disputeId, trainerUser.id, trainer.id, 'Nouvelle pièce : le sommaire publié à la vente.',
    )
    expect(second.status).toBe('OPEN')
  })

  it('ne répond pas deux fois à la même contestation', async () => {
    const { trainerUser, trainer, admin, disputeId } = await setup()
    const ticket = await contestDispute(disputeId, trainerUser.id, trainer.id, 'Argument initial circonstancié.')

    await resolveSupportTicket(ticket.id, admin.id, 'Réponse apportée après vérification.')
    await expectFailure(
      resolveSupportTicket(ticket.id, admin.id, 'Seconde réponse sur le même ticket.'),
      'TICKET_NOT_OPEN',
    )
  })
})
