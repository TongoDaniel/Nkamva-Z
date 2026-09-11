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
  recountCommunityMembers, banCommunityMember, unbanCommunityMember,
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

    // La liste rend désormais une **page** : ses cartes, et de quoi savoir
    // qu'il y en a d'autres.
    const list = await listPublicCommunities()
    expect(list.total).toBe(1)
    expect(list.page).toBe(1)
    expect(list.items).toHaveLength(1)
    expect(list.items[0].name).toBe('Les artisans du back')
    expect(list.items[0].includedCount).toBe(1)
    expect(list.items[0].trainer.fullName).toBe('Awa Sarr')

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

  it('délier ne remet pas la ressource en vente, et ne retire rien aux membres', async () => {
    const { community, course, trainer, trainerUser, learner } = await setup()
    await linkCourseToCommunity(community.id, course.id, trainer.id, trainerUser.id)
    await subscribe(community.id, learner.id)
    await unlinkCourseFromCommunity(community.id, course.id, trainer.id, trainerUser.id)

    // Ce test attendait l'inverse — il consacrait un comportement qui
    // contredisait l'arbitrage 53 : « ce qui a été annoncé comme inclus ne
    // repasse jamais derrière un paywall ». Arbitré le 5 septembre 2026
    // (arbitrage 137) : délier range, seule la fermeture libère.
    expect((await searchCourses({ page: 1, pageSize: 10 })).total).toBe(0)
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

  // --- `membersCount`, recompté plutôt qu'incrémenté ------------------------
  //
  // Le compteur est dénormalisé, et il avait dérivé : une base affichait 3
  // membres d'un côté, 0 de l'autre, pour la même communauté. Trois causes,
  // dont deux que ces cas ferment : une définition de « membre » qui glissait,
  // et un chemin d'écriture qui ne recomptait pas.

  it('le compteur suit les adhésions ouvertes, banni compris', async () => {
    const { community, learner } = await setup()
    const autre = await prisma.user.create({ data: { email: 'autre@test.com', role: 'LEARNER' } })
    const parti = await prisma.user.create({ data: { email: 'parti@test.com', role: 'LEARNER' } })
    await subscribe(community.id, learner.id)
    await subscribe(community.id, autre.id, { status: 'BANNED' })
    // Période close : il n'est plus membre, il garde ce qu'il a reçu.
    await subscribe(community.id, parti.id, { status: 'EXPIRED', endDaysAgo: 5 })

    const compte = await recountCommunityMembers(prisma, community.id)

    // Un banni est écarté de la parole, pas de l'accès (arbitrage 40) : il
    // compte. C'est la définition unique du produit, et elle était lue
    // autrement par l'écran du formateur — d'où deux nombres pour une idée.
    expect(compte).toBe(2)
    const row = await prisma.community.findUnique({ where: { id: community.id } })
    expect(row?.membersCount).toBe(2)
  })

  it('le recompte répare une colonne fausse, et ne dérive pas', async () => {
    const { community, learner } = await setup()
    await subscribe(community.id, learner.id)

    // Ce qu'un script d'essai ou un seed laisse derrière lui en écrivant une
    // adhésion sans passer par le service : la colonne ment.
    await prisma.community.update({ where: { id: community.id }, data: { membersCount: 47 } })

    expect(await recountCommunityMembers(prisma, community.id)).toBe(1)
    // Idempotent : deux appels donnent le même nombre, là où deux `+1` en
    // donnaient deux différents.
    expect(await recountCommunityMembers(prisma, community.id)).toBe(1)
  })

  it('lever la sanction de quelqu’un dont la période est close le retire du compte', async () => {
    const { community, learner, trainer, trainerUser } = await setup()
    // Banni **et** période close : la levée pose `EXPIRED`, qui sort des
    // adhésions ouvertes. Aucun chemin ne touchait au compteur ici — la
    // communauté gardait un membre qu'elle n'avait plus.
    await subscribe(community.id, learner.id, { status: 'BANNED', endDaysAgo: 5 })
    await recountCommunityMembers(prisma, community.id)
    expect((await prisma.community.findUnique({ where: { id: community.id } }))?.membersCount).toBe(1)

    await unbanCommunityMember(community.id, learner.id, trainer.id, trainerUser.id)

    const apres = await prisma.communitySubscription.findFirst({ where: { communityId: community.id } })
    expect(apres?.status).toBe('EXPIRED')
    expect((await prisma.community.findUnique({ where: { id: community.id } }))?.membersCount).toBe(0)
  })

  it('bannir ne change pas le nombre de membres', async () => {
    const { community, learner, trainer, trainerUser } = await setup()
    await subscribe(community.id, learner.id)
    await recountCommunityMembers(prisma, community.id)

    await banCommunityMember(community.id, learner.id, trainer.id, trainerUser.id, 'Propos déplacés')

    expect((await prisma.community.findUnique({ where: { id: community.id } }))?.membersCount).toBe(1)
  })
})
