// ==========================================================================
// Lot 8 — Ce qui relie une ressource à une communauté (F3.10, F3.11)
// ==========================================================================
// Trois décisions du 5 septembre 2026, prises après avoir constaté que deux
// prémisses du §14 étaient fausses : la fermeture n'était pas définitive
// (`reopenCommunity` existe), et la déliaison remettait déjà la ressource en
// vente — ce que l'arbitrage 53 interdit explicitement.
//
//   · on n'associe qu'à une communauté **ouverte**, rayon **allumé** (136) ;
//   · délier ne remet **pas** en vente, fermer **oui** (137) ;
//   · une ressource incluse apparaît dans « Mes ressources », avec sa
//     communauté et un lien direct (F3.11).

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  linkCourseToCommunity,
  unlinkCourseFromCommunity,
  closeCommunity,
  reopenCommunity,
  hasCommunityAccess,
} from '@/lib/communities'
import { listMyResources } from '@/lib/access'

const JOUR = 86_400_000

describe('Lot 8 — ressources et communautés', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function decor(opts: { resourcesEnabled?: boolean; status?: string } = {}) {
    const trainerUser = await prisma.user.create({
      data: { email: 'formatrice@test.com', role: 'TRAINER', fullName: 'Awa Sarr' },
    })
    const profile = await prisma.trainerProfile.create({
      data: { userId: trainerUser.id, verifiedLegalName: 'Awa Sarr', approvedAt: new Date() },
    })
    await prisma.wallet.create({ data: { trainerId: profile.id, balance: 0 } })

    const community = await prisma.community.create({
      data: {
        trainerId: profile.id, name: 'Cercle des semeurs', slug: 'cercle-des-semeurs',
        priceFcfa: 5_000,
        status: opts.status ?? 'active',
        resourcesEnabled: opts.resourcesEnabled ?? true,
      },
    })

    return { trainerUser, profile, community }
  }

  async function ressource(profileId: string, suffixe = 'a') {
    return prisma.course.create({
      data: {
        trainerId: profileId,
        slug: `ressource-${suffixe}-${Math.random().toString(36).slice(2, 8)}`,
        title: `Ressource ${suffixe}`,
        blurb: 'Une accroche',
        description: 'Une description complète.',
        category: 'dev', format: 'pdf', priceFcfa: 15_000,
        status: 'published', publishedAt: new Date(),
        contentS3Key: 'course-assets/fixture/content',
        contentSizeBytes: BigInt(1024), contentMimeType: 'application/pdf',
      },
    })
  }

  async function membre(communityId: string, opts: { termine?: boolean } = {}) {
    const learner = await prisma.user.create({
      data: { email: `membre-${Math.random().toString(36).slice(2, 8)}@test.com`, role: 'LEARNER' },
    })
    await prisma.communitySubscription.create({
      data: {
        communityId, learnerId: learner.id,
        status: opts.termine ? 'EXPIRED' : 'ACTIVE',
        periodStart: new Date(Date.now() - 30 * JOUR),
        periodEnd: opts.termine ? new Date(Date.now() - JOUR) : new Date(Date.now() + 30 * JOUR),
      },
    })
    return learner
  }

  // --- Arbitrage 136 : la garde à la liaison -------------------------------

  it('on associe à une communauté ouverte, rayon allumé', async () => {
    const { profile, community, trainerUser } = await decor()
    const course = await ressource(profile.id)

    const lien = await linkCourseToCommunity(community.id, course.id, profile.id, trainerUser.id)
    expect(lien.communityId).toBe(community.id)

    const apres = await prisma.course.findUnique({ where: { id: course.id } })
    expect(apres?.circuit).toBe('COMMUNITY')
  })

  it('une communauté fermée refuse la liaison', async () => {
    // Aucun contrôle n'existait : on pouvait garnir une communauté que plus
    // personne ne peut rejoindre.
    const { profile, community, trainerUser } = await decor({ status: 'closed' })
    const course = await ressource(profile.id)

    await expect(linkCourseToCommunity(community.id, course.id, profile.id, trainerUser.id))
      .rejects.toThrow('COMMUNITY_CLOSED')
  })

  it('un rayon éteint refuse la liaison', async () => {
    const { profile, community, trainerUser } = await decor({ resourcesEnabled: false })
    const course = await ressource(profile.id)

    await expect(linkCourseToCommunity(community.id, course.id, profile.id, trainerUser.id))
      .rejects.toThrow('COMMUNITY_RESOURCES_DISABLED')
  })

  it('éteindre le rayon ne délie rien de ce qui est déjà là', async () => {
    const { profile, community, trainerUser } = await decor()
    const course = await ressource(profile.id)
    await linkCourseToCommunity(community.id, course.id, profile.id, trainerUser.id)
    const learner = await membre(community.id)

    await prisma.community.update({
      where: { id: community.id },
      data: { resourcesEnabled: false },
    })

    // L'interrupteur éteint la vitrine, il ne reprend pas ce qui a été donné.
    expect(await hasCommunityAccess(learner.id, course.id)).toBe(true)
  })

  // --- Arbitrage 137 : délier non, fermer oui ------------------------------

  it('délier ne remet pas la ressource en vente', async () => {
    const { profile, community, trainerUser } = await decor()
    const course = await ressource(profile.id)
    await linkCourseToCommunity(community.id, course.id, profile.id, trainerUser.id)

    await unlinkCourseFromCommunity(community.id, course.id, profile.id, trainerUser.id)

    // Le code rebasculait en `MARKETPLACE`, ce que l'arbitrage 53 interdit :
    // ce qui a été annoncé comme inclus ne repasse pas derrière un péage sur
    // un simple geste de rangement.
    const apres = await prisma.course.findUnique({ where: { id: course.id } })
    expect(apres?.circuit).toBe('COMMUNITY')
  })

  it('mais délier retire bien la ressource de la vitrine', async () => {
    const { profile, community, trainerUser } = await decor()
    const course = await ressource(profile.id)
    await linkCourseToCommunity(community.id, course.id, profile.id, trainerUser.id)
    await unlinkCourseFromCommunity(community.id, course.id, profile.id, trainerUser.id)

    const lien = await prisma.communityCourse.findFirst({ where: { courseId: course.id } })
    expect(lien?.unlinkedAt).toBeInstanceOf(Date)
  })

  it('un membre garde ce qui a été délié', async () => {
    const { profile, community, trainerUser } = await decor()
    const course = await ressource(profile.id)
    await linkCourseToCommunity(community.id, course.id, profile.id, trainerUser.id)
    const learner = await membre(community.id)

    await unlinkCourseFromCommunity(community.id, course.id, profile.id, trainerUser.id)

    expect(await hasCommunityAccess(learner.id, course.id)).toBe(true)
  })

  it('fermer la communauté libère ses ressources vers la marketplace', async () => {
    const { profile, community, trainerUser } = await decor()
    const a = await ressource(profile.id, 'a')
    const b = await ressource(profile.id, 'b')
    await linkCourseToCommunity(community.id, a.id, profile.id, trainerUser.id)
    await linkCourseToCommunity(community.id, b.id, profile.id, trainerUser.id)

    const resultat = await closeCommunity(community.id, profile.id, trainerUser.id)
    expect(resultat.releasedCourses).toBe(2)

    // Sans communauté pour les porter, elles deviendraient inobtenables par
    // quiconque, et le formateur qui arrête perdrait son catalogue.
    for (const id of [a.id, b.id]) {
      expect((await prisma.course.findUnique({ where: { id } }))?.circuit).toBe('MARKETPLACE')
    }
  })

  it('la fermeture ne retire rien aux membres qui avaient accès', async () => {
    const { profile, community, trainerUser } = await decor()
    const course = await ressource(profile.id)
    await linkCourseToCommunity(community.id, course.id, profile.id, trainerUser.id)
    const learner = await membre(community.id)

    await closeCommunity(community.id, profile.id, trainerUser.id)

    // L'accès se juge sur le chevauchement d'une adhésion et d'une liaison
    // passées : ce chevauchement a déjà eu lieu.
    expect(await hasCommunityAccess(learner.id, course.id)).toBe(true)
  })

  it('rouvrir ne rattache pas ce que la fermeture a libéré', async () => {
    const { profile, community, trainerUser } = await decor()
    const course = await ressource(profile.id)
    await linkCourseToCommunity(community.id, course.id, profile.id, trainerUser.id)
    await closeCommunity(community.id, profile.id, trainerUser.id)

    await reopenCommunity(community.id, profile.id, trainerUser.id)

    // Même règle que pour les adhésions éteintes : le formateur relie ce qu'il
    // veut, on ne ressuscite pas une liaison sans son consentement.
    const apres = await prisma.course.findUnique({ where: { id: course.id } })
    expect(apres?.circuit).toBe('MARKETPLACE')
    const lien = await prisma.communityCourse.findFirst({
      where: { courseId: course.id, unlinkedAt: null },
    })
    expect(lien).toBeNull()
  })

  it('une communauté sans ressource se ferme sans rien libérer', async () => {
    const { profile, community, trainerUser } = await decor()
    const resultat = await closeCommunity(community.id, profile.id, trainerUser.id)
    expect(resultat.releasedCourses).toBe(0)
  })

  // --- F3.11 : la ressource incluse se retrouve où on la cherche -----------

  it('une ressource incluse apparaît dans « Mes ressources », avec sa communauté', async () => {
    const { profile, community, trainerUser } = await decor()
    const course = await ressource(profile.id)
    await linkCourseToCommunity(community.id, course.id, profile.id, trainerUser.id)
    const learner = await membre(community.id)

    const liste = await listMyResources(learner.id)

    // Elle n'y était pas : on ne la retrouvait que par « Mes communautés »,
    // deux écrans plus loin. C'est le constat 4 de l'audit.
    expect(liste.counts.all).toBe(1)
    expect(liste.items[0].course?.id).toBe(course.id)
    expect(liste.items[0].origin).toBe('community')
    expect(liste.items[0].community).toEqual({ slug: community.slug, name: community.name })
  })

  it('un ancien membre la garde dans sa liste', async () => {
    const { profile, community, trainerUser } = await decor()
    const course = await ressource(profile.id)
    await linkCourseToCommunity(community.id, course.id, profile.id, trainerUser.id)
    // La liaison doit précéder la fin de l'adhésion : c'est le chevauchement
    // qui fait le droit, pas la seule existence d'un lien.
    await prisma.communityCourse.updateMany({
      where: { courseId: course.id },
      data: { linkedAt: new Date(Date.now() - 40 * JOUR) },
    })
    const learner = await membre(community.id, { termine: true })

    // Arbitrage 34 : le membre sortant conserve ce qui était inclus pendant son
    // adhésion.
    expect((await listMyResources(learner.id)).counts.all).toBe(1)
  })

  it('mais pas ce qui a été ajouté après son départ', async () => {
    const { profile, community, trainerUser } = await decor()
    const course = await ressource(profile.id)
    // Liaison d'aujourd'hui, adhésion close hier : les deux périodes ne se
    // croisent jamais.
    await linkCourseToCommunity(community.id, course.id, profile.id, trainerUser.id)
    const learner = await membre(community.id, { termine: true })

    expect((await listMyResources(learner.id)).counts.all).toBe(0)
  })

  it('un non-membre ne voit rien', async () => {
    const { profile, community, trainerUser } = await decor()
    const course = await ressource(profile.id)
    await linkCourseToCommunity(community.id, course.id, profile.id, trainerUser.id)
    const etranger = await prisma.user.create({
      data: { email: 'etranger@test.com', role: 'LEARNER' },
    })

    expect((await listMyResources(etranger.id)).counts.all).toBe(0)
  })

  it('une ressource achetée puis incluse n\'apparaît qu\'une fois', async () => {
    const { profile, community, trainerUser } = await decor()
    const course = await ressource(profile.id)
    const learner = await membre(community.id)

    await prisma.purchase.create({
      data: {
        learnerId: learner.id, trainerId: profile.id, courseId: course.id,
        amountFcfa: 15_000, commissionRate: 0.15,
        trainerShareFcfa: 12_750, platformShareFcfa: 2_250,
        provider: 'STRIPE', providerStatus: 'SUCCEEDED',
        providerTransactionId: `pi_${Math.random().toString(36).slice(2, 12)}`,
      },
    })
    // La liaison est écrite à la main : `linkCourseToCommunity` refuse une
    // ressource déjà vendue (arbitrage 47), et c'est précisément le cas limite
    // qu'on veut couvrir — celui d'un achat antérieur à la règle.
    await prisma.communityCourse.create({ data: { communityId: community.id, courseId: course.id } })

    const liste = await listMyResources(learner.id)
    expect(liste.counts.all).toBe(1)
    // L'achat prime : c'est lui qui porte le droit le plus fort.
    expect(liste.items[0].origin).toBe('purchase')
  })
})
