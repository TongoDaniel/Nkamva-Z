// ==========================================================================
// Tendance — arbitrage 142
// ==========================================================================
// Ce qui est tenu ici, c'est l'honnêteté des étiquettes de l'accueil :
//
//   · une vente ne compte que réglée, non remboursée, et dans la fenêtre ;
//   · sous le seuil, on ne prétend pas classer (`ranked: false`) ;
//   · on ne propose jamais à quelqu'un ce qu'il a déjà, ni ce qu'il a publié ;
//   · l'onglet « Tendance » des événements ne montre que des communautés
//     publiques, ouvertes, qu'on n'a pas rejointes ;
//   · un apprenant est une personne, comptée une fois ;
//   · l'annuaire, la fiche, la recherche et la fiche ressource lisent ce même
//     compte, et l'annuaire comme la recherche se rangent dessus (arbitrage 143).

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  trendingCourses,
  trendingSessions,
  trendingTrainers,
  TRENDING_WINDOW_DAYS,
} from '@/lib/trending'
import { countTrainerLearners, getPublicTrainer, listPublicTrainers } from '@/lib/trainers'
import { searchEverything } from '@/lib/search'

const JOUR = 86_400_000
const NOW = new Date('2026-09-13T10:00:00Z')

let seq = 0
const uid = () => `${Date.now().toString(36)}-${++seq}`

async function makeUser(role: 'LEARNER' | 'TRAINER' = 'LEARNER') {
  return prisma.user.create({
    data: { email: `${uid()}@test.com`, role, fullName: `Personne ${seq}` },
  })
}

async function makeTrainer() {
  const user = await makeUser('TRAINER')
  const profile = await prisma.trainerProfile.create({
    data: { userId: user.id, approvedAt: new Date(NOW.getTime() - 100 * JOUR), slogan: 'Accroche' },
  })
  return { user, profile }
}

async function makeCourse(
  trainerId: string,
  over: { status?: string; circuit?: 'MARKETPLACE' | 'COMMUNITY'; publishedAt?: Date } = {},
) {
  const slug = `ressource-${uid()}`
  return prisma.course.create({
    data: {
      trainerId, slug, title: slug, blurb: 'Accroche', description: 'Description',
      category: 'dev', format: 'pdf', priceFcfa: 5000,
      status: over.status ?? 'published',
      circuit: over.circuit ?? 'MARKETPLACE',
      publishedAt: over.publishedAt ?? new Date(NOW.getTime() - 10 * JOUR),
    },
  })
}

async function sell(
  course: { id: string; trainerId: string },
  learnerId: string,
  over: { status?: 'SUCCEEDED' | 'FAILED' | 'PENDING'; refunded?: boolean; daysAgo?: number } = {},
) {
  return prisma.purchase.create({
    data: {
      learnerId, courseId: course.id, trainerId: course.trainerId,
      amountFcfa: 5000, commissionRate: 0.15, trainerShareFcfa: 4250, platformShareFcfa: 750,
      provider: 'PAWAPAY', providerStatus: over.status ?? 'SUCCEEDED',
      refundedAt: over.refunded ? NOW : null,
      createdAt: new Date(NOW.getTime() - (over.daysAgo ?? 2) * JOUR),
    },
  })
}

async function makeCommunity(
  trainerId: string,
  over: { visibility?: 'PUBLIC' | 'PRIVATE'; status?: string; eventsEnabled?: boolean; membersCount?: number } = {},
) {
  return prisma.community.create({
    data: {
      trainerId, name: `Communauté ${seq}`, slug: `communaute-${uid()}`, priceFcfa: 3000,
      visibility: over.visibility ?? 'PUBLIC', status: over.status ?? 'active',
      eventsEnabled: over.eventsEnabled ?? true, membersCount: over.membersCount ?? 0,
    },
  })
}

async function join(
  communityId: string,
  learnerId: string,
  over: { status?: 'ACTIVE' | 'CANCELED' | 'EXPIRED'; daysAgo?: number } = {},
) {
  const since = new Date(NOW.getTime() - (over.daysAgo ?? 3) * JOUR)
  return prisma.communitySubscription.create({
    data: {
      communityId, learnerId, status: over.status ?? 'ACTIVE',
      periodStart: since, periodEnd: new Date(since.getTime() + 30 * JOUR), createdAt: since,
    },
  })
}

async function schedule(
  community: { id: string; trainerId: string },
  title: string,
  over: { inDays?: number; status?: 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELED' } = {},
) {
  return prisma.liveSession.create({
    data: {
      communityId: community.id, trainerId: community.trainerId, title,
      scheduledStartAt: new Date(NOW.getTime() + (over.inDays ?? 2) * JOUR),
      status: over.status ?? 'SCHEDULED', roomName: `salle-${uid()}`,
    },
  })
}

describe('Tendance — ressources', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  it('ne prétend pas classer une base jeune : sous le seuil, ce sont des nouveautés', async () => {
    const { profile } = await makeTrainer()
    const ancienne = await makeCourse(profile.id, { publishedAt: new Date(NOW.getTime() - 20 * JOUR) })
    const recente = await makeCourse(profile.id, { publishedAt: new Date(NOW.getTime() - 1 * JOUR) })
    const acheteur = await makeUser()
    await sell(ancienne, acheteur.id)

    const result = await trendingCourses({ limit: 6, now: NOW })
    expect(result.ranked).toBe(false)
    expect(result.items.map((c) => c.id)).toEqual([recente.id, ancienne.id])
  })

  it('classe par ventes comptées, et complète la rangée par les nouveautés', async () => {
    const { profile } = await makeTrainer()
    const [a, b, c, sansVente] = [
      await makeCourse(profile.id), await makeCourse(profile.id),
      await makeCourse(profile.id), await makeCourse(profile.id),
    ]
    const acheteurs = await Promise.all([makeUser(), makeUser(), makeUser()])
    for (const learner of acheteurs) await sell(b, learner.id)
    for (const learner of acheteurs.slice(0, 2)) await sell(c, learner.id)
    await sell(a, acheteurs[0].id)

    const result = await trendingCourses({ limit: 6, now: NOW })
    expect(result.ranked).toBe(true)
    expect(result.items.map((x) => x.id)).toEqual([b.id, c.id, a.id, sansVente.id])
  })

  it('ne compte ni un remboursement, ni un échec, ni une vente hors fenêtre', async () => {
    const { profile } = await makeTrainer()
    const gonflee = await makeCourse(profile.id)
    const vraies = [await makeCourse(profile.id), await makeCourse(profile.id), await makeCourse(profile.id)]
    // Un achat par apprenant et par ressource : la base l'impose. Douze
    // acheteurs, donc, pour douze achats qui ne doivent pas compter.
    const acheteurs = await Promise.all(Array.from({ length: 12 }, () => makeUser()))

    for (const [i, learner] of acheteurs.entries()) {
      if (i % 3 === 0) await sell(gonflee, learner.id, { refunded: true })
      else if (i % 3 === 1) await sell(gonflee, learner.id, { status: 'FAILED' })
      else await sell(gonflee, learner.id, { daysAgo: TRENDING_WINDOW_DAYS + 1 })
    }
    for (const course of vraies) await sell(course, acheteurs[0].id)

    const result = await trendingCourses({ limit: 3, now: NOW })
    expect(result.ranked).toBe(true)
    expect(result.items.map((x) => x.id)).not.toContain(gonflee.id)
  })

  it("ne propose ni ce qu'on possède, ni ce qu'on a publié, ni un brouillon, ni une ressource incluse", async () => {
    const { profile } = await makeTrainer()
    const moi = await makeTrainer()
    const achetee = await makeCourse(profile.id)
    const recue = await makeCourse(profile.id)
    const libre = await makeCourse(profile.id)
    const publieeParMoi = await makeCourse(moi.profile.id)
    await makeCourse(profile.id, { status: 'draft' })
    await makeCourse(profile.id, { circuit: 'COMMUNITY' })

    await sell(achetee, moi.user.id)
    const communaute = await makeCommunity(profile.id)
    await prisma.communityCourse.create({ data: { communityId: communaute.id, courseId: recue.id } })
    await join(communaute.id, moi.user.id)

    const result = await trendingCourses({ viewerId: moi.user.id, limit: 10, now: NOW })
    const ids = result.items.map((x) => x.id)
    expect(ids).toEqual([libre.id])
    expect(ids).not.toContain(publieeParMoi.id)
  })
})

describe('Tendance — séances', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  it("ne montre que les communautés publiques, ouvertes, à événements, qu'on n'a pas rejointes", async () => {
    const { profile } = await makeTrainer()
    const moi = await makeTrainer()
    const decouvrir = await makeCommunity(profile.id)
    const rejointe = await makeCommunity(profile.id)
    const privee = await makeCommunity(profile.id, { visibility: 'PRIVATE' })
    const fermee = await makeCommunity(profile.id, { status: 'closed' })
    const sansEvenements = await makeCommunity(profile.id, { eventsEnabled: false })
    const lamienne = await makeCommunity(moi.profile.id)
    await join(rejointe.id, moi.user.id)

    await schedule(decouvrir, 'Visible')
    await schedule(rejointe, 'Déjà dans mon agenda')
    await schedule(privee, 'Privée')
    await schedule(fermee, 'Fermée')
    await schedule(sansEvenements, 'Sans événements')
    await schedule(lamienne, 'Je l’anime')

    const result = await trendingSessions({ viewerId: moi.user.id, now: NOW })
    expect(result.map((r) => r.session.title)).toEqual(['Visible'])
    expect(result[0].priceFcfa).toBe(3000)
    expect(result[0].visual.id).toBe(decouvrir.id)
    expect(result[0].session.community.id).toBe(decouvrir.id)
  })

  it('garde les séances en cours et à venir, dans l’ordre du temps', async () => {
    const { profile } = await makeTrainer()
    const spectateur = await makeUser()
    const communaute = await makeCommunity(profile.id)

    await schedule(communaute, 'Dans cinq jours', { inDays: 5 })
    await schedule(communaute, 'En direct', { inDays: -0.02, status: 'LIVE' })
    await schedule(communaute, 'Demain', { inDays: 1 })
    await schedule(communaute, 'Terminée', { inDays: -1, status: 'ENDED' })
    await schedule(communaute, 'Annulée', { inDays: 3, status: 'CANCELED' })
    await schedule(communaute, 'Jamais lancée, la semaine dernière', { inDays: -7 })

    const result = await trendingSessions({ viewerId: spectateur.id, now: NOW })
    expect(result.map((r) => r.session.title)).toEqual(['En direct', 'Demain', 'Dans cinq jours'])
  })
})

describe('Tendance — formateurs', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  it('respecte la visibilité publique et retire le formateur qui regarde', async () => {
    const visible = await makeTrainer()
    await makeCourse(visible.profile.id)
    await makeTrainer() // approuvé, mais rien à montrer : caché de l'annuaire
    const moi = await makeTrainer()
    await makeCourse(moi.profile.id)

    const result = await trendingTrainers({ viewerTrainerId: moi.profile.id, limit: 5, now: NOW })
    expect(result.ranked).toBe(false)
    expect(result.items.map((t) => t.id)).toEqual([visible.profile.id])
    expect(result.items[0].publishedCount).toBe(1)
  })

  it('classe par ventes sur la fenêtre quand il y a de quoi', async () => {
    const trainers = await Promise.all([makeTrainer(), makeTrainer(), makeTrainer()])
    const courses = await Promise.all(trainers.map((t) => makeCourse(t.profile.id)))
    const acheteurs = await Promise.all([makeUser(), makeUser(), makeUser()])
    for (const learner of acheteurs) await sell(courses[2], learner.id)
    for (const learner of acheteurs.slice(0, 2)) await sell(courses[1], learner.id)
    await sell(courses[0], acheteurs[0].id)

    const result = await trendingTrainers({ limit: 5, now: NOW })
    expect(result.ranked).toBe(true)
    expect(result.items.map((t) => t.id)).toEqual([
      trainers[2].profile.id, trainers[1].profile.id, trainers[0].profile.id,
    ])
  })

  it('compte chaque apprenant une fois, et seulement ce qui est réglé ou ouvert', async () => {
    const { profile } = await makeTrainer()
    const course = await makeCourse(profile.id)
    const communaute = await makeCommunity(profile.id)
    const [fidele, rembourse, parti, membre] = await Promise.all([
      makeUser(), makeUser(), makeUser(), makeUser(),
    ])

    await sell(course, fidele.id)
    await join(communaute.id, fidele.id) // acheteur ET membre : une seule personne
    await sell(course, rembourse.id, { refunded: true })
    await join(communaute.id, parti.id, { status: 'CANCELED' })
    await join(communaute.id, membre.id)

    const counts = await countTrainerLearners([profile.id])
    expect(counts.get(profile.id)).toBe(2)
  })
})

describe('Apprenants réels — annuaire, fiche et recherche (arbitrage 143)', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  /** Un formateur visible, sous un nom choisi : l'ordre alphabétique départage. */
  async function named(fullName: string) {
    const trainer = await makeTrainer()
    await prisma.user.update({ where: { id: trainer.user.id }, data: { fullName } })
    return trainer
  }

  /**
   * Zoé a deux acheteurs, Yann un membre, Awa et Bruno personne. La colonne
   * morte est absente du schéma : si un écran la relisait, tsc le refuserait —
   * ce qui est tenu ici, c'est l'ordre et le nombre.
   */
  async function monde() {
    const awa = await named('Awa Diallo')
    const zoe = await named('Zoé Mbarga')
    const bruno = await named('Bruno Etoundi')
    const yann = await named('Yann Kamga')
    await makeCourse(awa.profile.id)
    await makeCourse(bruno.profile.id)
    const coursZoe = await makeCourse(zoe.profile.id)
    const communauteYann = await makeCommunity(yann.profile.id)

    const [a, b, c] = await Promise.all([makeUser(), makeUser(), makeUser()])
    await sell(coursZoe, a.id)
    await sell(coursZoe, b.id)
    await join(communauteYann.id, c.id)
    return { awa, zoe, bruno, yann }
  }

  it("range l'annuaire par apprenants réels, puis par nom", async () => {
    const { awa, zoe, bruno, yann } = await monde()

    const listed = await listPublicTrainers()
    expect(listed.map((t) => t.id)).toEqual([
      zoe.profile.id, yann.profile.id, awa.profile.id, bruno.profile.id,
    ])
    expect(listed.map((t) => t.learners)).toEqual([2, 1, 0, 0])
  })

  it('garde cet ordre sous un filtre de recherche', async () => {
    const { awa, zoe, bruno, yann } = await monde()

    // « b » n'est ni dans « Accroche », le slogan de tous, ni chez Awa ni chez
    // Yann : il ne reste que Zoé Mbarga et Bruno Etoundi.
    const filtered = await listPublicTrainers('b')
    expect(filtered.map((t) => t.id)).toEqual([zoe.profile.id, bruno.profile.id])

    // Le slogan, lui, les ramène tous : la recherche transversale suit l'annuaire.
    const results = await searchEverything('Accroche')
    expect(results.trainers.map((t) => t.id)).toEqual([
      zoe.profile.id, yann.profile.id, awa.profile.id, bruno.profile.id,
    ])
  })

  it("donne à la fiche le même compte qu'à l'annuaire", async () => {
    const { zoe, awa } = await monde()

    expect((await getPublicTrainer(zoe.profile.id))!.learners).toBe(2)
    expect((await getPublicTrainer(awa.profile.id))!.learners).toBe(0)
  })
})
