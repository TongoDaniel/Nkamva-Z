// ==========================================================================
// Communautés — circuits exclusifs et accès aux ressources incluses
// ==========================================================================
// Arbitrages 45, 47 et 48. Le cœur de ces tests est la formule d'accès : elle
// croise une période d'adhésion et une période de liaison, et c'est la
// déliaison qui rend le croisement nécessaire.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  listPublicCommunities, getPublicCommunity,
  linkCourseToCommunity, unlinkCourseFromCommunity,
  hasCommunityAccess, listMyIncludedCourses,
} from '@/lib/communities'
import { searchCourses } from '@/lib/catalog'
import { initiatePurchase } from '@/lib/purchases'
import { checkCourseAccess } from '@/lib/access'

const DAY = 86_400_000

describe('Communautés', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup() {
    const trainerUser = await prisma.user.create({
      data: { email: 'formateur@test.com', role: 'TRAINER', fullName: 'Awa Sarr' },
    })
    const trainer = await prisma.trainerProfile.create({
      data: { userId: trainerUser.id, approvedAt: new Date(), slogan: 'Architecture logicielle' },
    })
    await prisma.wallet.create({ data: { trainerId: trainer.id, balance: 0 } })
    const community = await prisma.community.create({
      data: {
        trainerId: trainer.id, name: 'Les artisans du back', slug: 'artisans-back',
        description: 'Entraide entre développeurs', priceFcfa: 5000,
      },
    })
    const course = await prisma.course.create({
      data: {
        trainerId: trainer.id, slug: 'ddd', title: 'Masterclass DDD', blurb: 'Accroche',
        description: 'Description', category: 'dev', format: 'video', priceFcfa: 15000,
        status: 'published', publishedAt: new Date(),
        contentS3Key: 'course-assets/x/v.mp4', contentMimeType: 'video/mp4',
      },
    })
    const learner = await prisma.user.create({ data: { email: 'membre@test.com', role: 'LEARNER' } })
    return { trainerUser, trainer, community, course, learner }
  }

  /** Une adhésion, éventuellement passée. */
  function subscribe(
    communityId: string,
    learnerId: string,
    opts: { status?: 'ACTIVE' | 'EXPIRED' | 'BANNED'; startDaysAgo?: number; endDaysAgo?: number } = {},
  ) {
    const start = new Date(Date.now() - (opts.startDaysAgo ?? 30) * DAY)
    const end = new Date(Date.now() - (opts.endDaysAgo ?? -30) * DAY)
    return prisma.communitySubscription.create({
      data: {
        communityId, learnerId, status: opts.status ?? 'ACTIVE',
        periodStart: start, periodEnd: end, provider: 'STRIPE',
      },
    })
  }

  it('la liste et la fiche servent les vraies données', async () => {
    const { community, course, trainer, trainerUser } = await setup()
    await linkCourseToCommunity(community.id, course.id, trainer.id, trainerUser.id)

    const list = await listPublicCommunities()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Les artisans du back')
    expect(list[0].includedCount).toBe(1)
    expect(list[0].trainer.fullName).toBe('Awa Sarr')

    const detail = await getPublicCommunity('artisans-back')
    expect(detail!.courses.map((c) => c.title)).toEqual(['Masterclass DDD'])
  })

  it('arbitrage 47 — une ressource incluse quitte le catalogue et ne s\'achète plus', async () => {
    const { community, course, trainer, trainerUser, learner } = await setup()

    expect((await searchCourses({ page: 1, pageSize: 10 })).total).toBe(1)

    await linkCourseToCommunity(community.id, course.id, trainer.id, trainerUser.id)

    // Les deux circuits sont exclusifs : plus de vente à l'unité, donc plus de
    // présence au catalogue marchand.
    expect((await searchCourses({ page: 1, pageSize: 10 })).total).toBe(0)
    await expect(initiatePurchase(course.id, learner.id, 'STRIPE')).rejects.toThrow('COURSE_NOT_FOR_SALE')
  })

  it('refuse d\'inclure une ressource déjà vendue', async () => {
    const { community, course, trainer, trainerUser, learner } = await setup()
    await initiatePurchase(course.id, learner.id, 'STRIPE')

    // Sinon l'acheteur aurait payé une ressource que l'abonnement donne : c'est
    // exactement le cas que l'arbitrage 47 supprime.
    await expect(
      linkCourseToCommunity(community.id, course.id, trainer.id, trainerUser.id),
    ).rejects.toThrow('COURSE_ALREADY_SOLD')
  })

  it('un membre actif accède à la ressource incluse sans l\'avoir achetée', async () => {
    const { community, course, trainer, trainerUser, learner } = await setup()
    await linkCourseToCommunity(community.id, course.id, trainer.id, trainerUser.id)
    await subscribe(community.id, learner.id)

    expect(await hasCommunityAccess(learner.id, course.id)).toBe(true)
    expect((await checkCourseAccess(course.id, learner.id)).granted).toBe(true)
    expect((await listMyIncludedCourses(learner.id)).map((c) => c.id)).toEqual([course.id])
  })

  it('arbitrage 48 — la déliaison conserve l\'accès de qui l\'avait', async () => {
    const { community, course, trainer, trainerUser, learner } = await setup()
    await linkCourseToCommunity(community.id, course.id, trainer.id, trainerUser.id)
    await subscribe(community.id, learner.id)

    await unlinkCourseFromCommunity(community.id, course.id, trainer.id, trainerUser.id)

    // La ligne est bornée, pas supprimée : le droit acquis survit.
    expect(await hasCommunityAccess(learner.id, course.id)).toBe(true)
    // Mais elle n'est plus annoncée aux futurs membres.
    const detail = await getPublicCommunity('artisans-back')
    expect(detail!.courses).toHaveLength(0)
    expect(detail!.includedCount).toBe(0)
  })

  it('un membre arrivé après la déliaison n\'y a pas droit', async () => {
    const { community, course, trainer, trainerUser, learner } = await setup()
    await linkCourseToCommunity(community.id, course.id, trainer.id, trainerUser.id)
    await unlinkCourseFromCommunity(community.id, course.id, trainer.id, trainerUser.id)

    // Adhésion ouverte après la fin de la liaison : les deux périodes ne se
    // chevauchent pas.
    await prisma.communityCourse.updateMany({
      where: { communityId: community.id, courseId: course.id },
      data: { linkedAt: new Date(Date.now() - 60 * DAY), unlinkedAt: new Date(Date.now() - 40 * DAY) },
    })
    await subscribe(community.id, learner.id, { startDaysAgo: 10 })

    expect(await hasCommunityAccess(learner.id, course.id)).toBe(false)
  })

  it('un ancien membre garde ce qui était lié pendant son passage', async () => {
    const { community, course, trainer, trainerUser, learner } = await setup()
    await linkCourseToCommunity(community.id, course.id, trainer.id, trainerUser.id)
    await prisma.communityCourse.updateMany({
      where: { communityId: community.id },
      data: { linkedAt: new Date(Date.now() - 90 * DAY) },
    })
    // Adhésion terminée il y a un mois, mais elle chevauchait la liaison.
    await subscribe(community.id, learner.id, {
      status: 'EXPIRED', startDaysAgo: 80, endDaysAgo: 30,
    })

    expect(await hasCommunityAccess(learner.id, course.id)).toBe(true)
  })

  it('un membre banni garde l\'accès — on écarte la parole, pas la lecture', async () => {
    const { community, course, trainer, trainerUser, learner } = await setup()
    await linkCourseToCommunity(community.id, course.id, trainer.id, trainerUser.id)
    await subscribe(community.id, learner.id, { status: 'BANNED' })

    expect(await hasCommunityAccess(learner.id, course.id)).toBe(true)
  })

  it('délier remet la ressource en vente, sans rien retirer aux membres', async () => {
    const { community, course, trainer, trainerUser, learner } = await setup()
    await linkCourseToCommunity(community.id, course.id, trainer.id, trainerUser.id)
    await subscribe(community.id, learner.id)
    await unlinkCourseFromCommunity(community.id, course.id, trainer.id, trainerUser.id)

    expect((await searchCourses({ page: 1, pageSize: 10 })).total).toBe(1)
    expect(await hasCommunityAccess(learner.id, course.id)).toBe(true)
  })

  it('refuse la liaison en double et la déliaison de ce qui n\'est pas lié', async () => {
    const { community, course, trainer, trainerUser } = await setup()

    await expect(
      unlinkCourseFromCommunity(community.id, course.id, trainer.id, trainerUser.id),
    ).rejects.toThrow('COURSE_NOT_LINKED')

    await linkCourseToCommunity(community.id, course.id, trainer.id, trainerUser.id)
    await expect(
      linkCourseToCommunity(community.id, course.id, trainer.id, trainerUser.id),
    ).rejects.toThrow('COURSE_ALREADY_LINKED')
  })

  it('un formateur ne lie que ses propres ressources', async () => {
    const { community, trainerUser, trainer } = await setup()
    const other = await prisma.user.create({ data: { email: 'autre@test.com', role: 'TRAINER' } })
    const otherTrainer = await prisma.trainerProfile.create({
      data: { userId: other.id, approvedAt: new Date() },
    })
    const otherCourse = await prisma.course.create({
      data: {
        trainerId: otherTrainer.id, slug: 'autre', title: 'Autre', blurb: 'Accroche',
        description: 'Description', category: 'dev', format: 'pdf', priceFcfa: 3000,
        status: 'published', publishedAt: new Date(),
        contentS3Key: 'course-assets/y/d.pdf', contentMimeType: 'application/pdf',
      },
    })

    await expect(
      linkCourseToCommunity(community.id, otherCourse.id, trainer.id, trainerUser.id),
    ).rejects.toThrow('NOT_OWNER')
  })
})
