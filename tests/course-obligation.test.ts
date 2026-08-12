// ==========================================================================
// Contenu sous obligation — arbitrages 13 et 19
// ==========================================================================
// Ce qu'un formateur ne peut pas effacer ne lui est plus compté. Ces tests
// vérifient les deux moments où l'appartenance bouge — la pose au premier achat
// abouti, et la révision au renouvellement — et surtout le moment où elle **ne
// bouge pas** : un remboursement ne rend pas l'espace le jour même.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { markCourseObligation, reviseTrainerObligations } from '@/lib/course-obligation'
import { creditWalletOnPurchase } from '@/lib/wallet'

describe('Contenu sous obligation', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup() {
    const user = await prisma.user.create({ data: { email: 'formateur@test.com', role: 'TRAINER' } })
    const trainer = await prisma.trainerProfile.create({
      data: { userId: user.id, approvedAt: new Date() },
    })
    const learner = await prisma.user.create({ data: { email: 'apprenant@test.com', role: 'LEARNER' } })
    return { user, trainer, learner }
  }

  function course(trainerId: string, slug = 'r1') {
    return prisma.course.create({
      data: {
        trainerId, slug, title: 'Ressource', blurb: 'Accroche', description: 'Description',
        category: 'dev', format: 'video', priceFcfa: 5_000,
        contentSizeBytes: BigInt(1024),
      },
    })
  }

  /** Un achat, à l'état où le webhook le trouve — ou déjà abouti. */
  function purchase(
    opts: {
      learnerId: string; trainerId: string; courseId: string
      transactionId: string; succeeded?: boolean; refundedAt?: Date | null; createdAt?: Date
    },
  ) {
    return prisma.purchase.create({
      data: {
        learnerId: opts.learnerId, trainerId: opts.trainerId, courseId: opts.courseId,
        amountFcfa: 5_000, commissionRate: 0.15, trainerShareFcfa: 4_250, platformShareFcfa: 750,
        provider: 'STRIPE', providerTransactionId: opts.transactionId,
        providerStatus: opts.succeeded ? 'SUCCEEDED' : 'PENDING',
        refundedAt: opts.refundedAt ?? null,
        ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      },
    })
  }

  // -------------------------------------------------------------------------
  // La pose
  // -------------------------------------------------------------------------

  it("l'achat abouti met la ressource sous obligation, à la date de l'achat", async () => {
    const { trainer, learner } = await setup()
    const c = await course(trainer.id)
    const boughtAt = new Date(Date.now() - 86_400_000)
    await purchase({
      learnerId: learner.id, trainerId: trainer.id, courseId: c.id,
      transactionId: 'pi_1', createdAt: boughtAt,
    })

    await prisma.$transaction((tx) => creditWalletOnPurchase(tx, 'pi_1', 'STRIPE'))

    const after = await prisma.course.findUniqueOrThrow({ where: { id: c.id } })
    // La date de l'achat, pas celle du webhook : c'est elle que la révision
    // recalculera, et les deux doivent tomber d'accord.
    expect(after.obligationAt?.getTime()).toBe(boughtAt.getTime())
  })

  it("le deuxième acheteur ne repousse pas la date du premier", async () => {
    const { trainer, learner } = await setup()
    const c = await course(trainer.id)
    const premier = new Date(Date.now() - 172_800_000)

    await markCourseObligation(prisma, c.id, premier)
    await markCourseObligation(prisma, c.id, new Date())

    const after = await prisma.course.findUniqueOrThrow({ where: { id: c.id } })
    expect(after.obligationAt?.getTime()).toBe(premier.getTime())
  })

  it("un achat de communauté ne met aucune ressource sous obligation", async () => {
    const { trainer, learner } = await setup()
    const c = await course(trainer.id)
    const community = await prisma.community.create({
      data: { trainerId: trainer.id, name: 'Salon', slug: 'salon', priceFcfa: 2_000, commissionRate: 0.15 },
    })
    await prisma.purchase.create({
      data: {
        learnerId: learner.id, trainerId: trainer.id, communityId: community.id,
        amountFcfa: 2_000, commissionRate: 0.15, trainerShareFcfa: 1_700, platformShareFcfa: 300,
        provider: 'STRIPE', providerTransactionId: 'pi_com', providerStatus: 'PENDING',
      },
    })

    await prisma.$transaction((tx) => creditWalletOnPurchase(tx, 'pi_com', 'STRIPE'))

    const after = await prisma.course.findUniqueOrThrow({ where: { id: c.id } })
    expect(after.obligationAt).toBeNull()
  })

  // -------------------------------------------------------------------------
  // La révision — arbitrage 19
  // -------------------------------------------------------------------------

  it('la révision rattrape une ressource vendue par un chemin hors webhook', async () => {
    const { trainer, learner } = await setup()
    const c = await course(trainer.id)
    const boughtAt = new Date(Date.now() - 86_400_000)
    await purchase({
      learnerId: learner.id, trainerId: trainer.id, courseId: c.id,
      transactionId: 'pi_2', succeeded: true, createdAt: boughtAt,
    })

    const result = await reviseTrainerObligations(trainer.id)

    expect(result.marked).toBe(1)
    const after = await prisma.course.findUniqueOrThrow({ where: { id: c.id } })
    expect(after.obligationAt?.getTime()).toBe(boughtAt.getTime())
  })

  it("le remboursement ne rend pas l'espace le jour même", async () => {
    const { trainer, learner } = await setup()
    const c = await course(trainer.id)
    await purchase({
      learnerId: learner.id, trainerId: trainer.id, courseId: c.id,
      transactionId: 'pi_3', succeeded: true,
    })
    await reviseTrainerObligations(trainer.id)

    // Le remboursement seul ne touche à rien : c'est tout l'objet de
    // l'arbitrage 19. Sans ce délai, les téléversements du formateur se
    // bloqueraient du jour au lendemain sans qu'il ait rien fait.
    await prisma.purchase.updateMany({
      where: { providerTransactionId: 'pi_3' },
      data: { refundedAt: new Date(), providerStatus: 'REFUNDED' },
    })

    const stillHeld = await prisma.course.findUniqueOrThrow({ where: { id: c.id } })
    expect(stillHeld.obligationAt).not.toBeNull()
  })

  it("la révision suivante, elle, la fait retomber dans le quota", async () => {
    const { trainer, learner } = await setup()
    const c = await course(trainer.id)
    await purchase({
      learnerId: learner.id, trainerId: trainer.id, courseId: c.id,
      transactionId: 'pi_4', succeeded: true,
    })
    await reviseTrainerObligations(trainer.id)
    await prisma.purchase.updateMany({
      where: { providerTransactionId: 'pi_4' },
      data: { refundedAt: new Date(), providerStatus: 'REFUNDED' },
    })

    const result = await reviseTrainerObligations(trainer.id)

    expect(result.cleared).toBe(1)
    const after = await prisma.course.findUniqueOrThrow({ where: { id: c.id } })
    expect(after.obligationAt).toBeNull()
  })

  it("un seul achat remboursé sur deux laisse la ressource sous obligation", async () => {
    const { trainer, learner } = await setup()
    const c = await course(trainer.id)
    const second = await prisma.user.create({ data: { email: 'autre@test.com', role: 'LEARNER' } })
    await purchase({
      learnerId: learner.id, trainerId: trainer.id, courseId: c.id,
      transactionId: 'pi_5', succeeded: true, refundedAt: new Date(),
    })
    await purchase({
      learnerId: second.id, trainerId: trainer.id, courseId: c.id,
      transactionId: 'pi_6', succeeded: true,
    })

    const result = await reviseTrainerObligations(trainer.id)

    expect(result.marked).toBe(1)
    const after = await prisma.course.findUniqueOrThrow({ where: { id: c.id } })
    expect(after.obligationAt).not.toBeNull()
  })

  it('la révision est silencieuse quand rien ne change', async () => {
    const { trainer } = await setup()
    await course(trainer.id)

    const result = await reviseTrainerObligations(trainer.id)

    expect(result).toEqual({ marked: 0, cleared: 0 })
  })
})
