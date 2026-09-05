// ==========================================================================
// Lot 9 — L'agenda montre ce qu'on y programme, le replay garde son salon
// ==========================================================================
// L'audit du 1er septembre 2026 rapportait qu'« un live planifié n'apparaît
// pas ». Le constat **ne se reproduit pas** sur `develop` : la séance apparaît
// pour l'animateur comme pour le membre, sur l'agenda comme dans l'espace de
// la communauté. Faute de cause, ces tests fixent le comportement attendu —
// si une modification future le casse, elle échouera ici plutôt que chez un
// formateur.
//
// Le vrai manque était ailleurs, et le cahier le disait : **F6.7 — le salon de
// la séance est conservé et rattaché au replay**. Les messages étaient écrits,
// le schéma expliquait qu'on les gardait pour le replay, et aucun écran ne les
// rendait.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  scheduleLiveSession,
  cancelLiveSession,
  listAgenda,
  listMyAgenda,
  listTrainerSessions,
  listReplayMessages,
} from '@/lib/lives'

const JOUR = 86_400_000

describe('Lot 9 — agenda et salon du replay', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function decor(opts: { eventsEnabled?: boolean } = {}) {
    const trainerUser = await prisma.user.create({
      data: { email: 'formatrice@test.com', role: 'TRAINER', fullName: 'Awa Sarr' },
    })
    const profile = await prisma.trainerProfile.create({
      data: { userId: trainerUser.id, verifiedLegalName: 'Awa Sarr', approvedAt: new Date() },
    })
    await prisma.wallet.create({ data: { trainerId: profile.id, balance: 0 } })
    const community = await prisma.community.create({
      data: {
        trainerId: profile.id, name: 'Cercle des directs', slug: 'cercle-des-directs',
        priceFcfa: 5_000, status: 'active', eventsEnabled: opts.eventsEnabled ?? true,
      },
    })
    return { trainerUser, profile, community }
  }

  async function membre(communityId: string) {
    const learner = await prisma.user.create({
      data: { email: `m-${Math.random().toString(36).slice(2, 8)}@test.com`, role: 'LEARNER', fullName: 'Koffi' },
    })
    await prisma.communitySubscription.create({
      data: {
        communityId, learnerId: learner.id, status: 'ACTIVE',
        periodStart: new Date(Date.now() - 5 * JOUR),
        periodEnd: new Date(Date.now() + 25 * JOUR),
      },
    })
    return learner
  }

  const dans = (jours: number) => new Date(Date.now() + jours * JOUR)

  // --- Ce qui est programmé apparaît ---------------------------------------

  it("une séance programmée apparaît dans l'agenda de son animateur", async () => {
    const { trainerUser, profile, community } = await decor()
    const { id } = await scheduleLiveSession(community.id, profile.id, trainerUser.id, {
      title: 'Revue de checklists QA',
      scheduledStartAt: dans(3),
    })

    const agenda = await listAgenda(trainerUser.id, profile.id)
    expect(agenda.map((s) => s.id)).toContain(id)
    expect(agenda.find((s) => s.id === id)?.mine).toBe(true)
  })

  it('et dans celui de chaque membre de la communauté', async () => {
    const { trainerUser, profile, community } = await decor()
    const learner = await membre(community.id)
    const { id } = await scheduleLiveSession(community.id, profile.id, trainerUser.id, {
      title: 'Revue de checklists QA',
      scheduledStartAt: dans(3),
    })

    const agenda = await listMyAgenda(learner.id)
    expect(agenda.map((s) => s.id)).toContain(id)
    // Le membre la suit, il ne l'anime pas : c'est ce drapeau qui décide de
    // l'action que l'écran propose.
    expect(agenda[0].mine).toBe(false)
  })

  it("un non-membre ne la voit pas", async () => {
    const { trainerUser, profile, community } = await decor()
    await scheduleLiveSession(community.id, profile.id, trainerUser.id, {
      title: 'Revue de checklists QA', scheduledStartAt: dans(3),
    })
    const etranger = await prisma.user.create({
      data: { email: 'etranger@test.com', role: 'LEARNER' },
    })

    expect(await listMyAgenda(etranger.id)).toHaveLength(0)
  })

  it("l'animateur ne la voit qu'une fois, même abonné à sa propre communauté", async () => {
    const { trainerUser, profile, community } = await decor()
    await prisma.communitySubscription.create({
      data: {
        communityId: community.id, learnerId: trainerUser.id, status: 'ACTIVE',
        periodStart: new Date(Date.now() - JOUR), periodEnd: dans(30),
      },
    })
    await scheduleLiveSession(community.id, profile.id, trainerUser.id, {
      title: 'Revue de checklists QA', scheduledStartAt: dans(3),
    })

    const agenda = await listAgenda(trainerUser.id, profile.id)
    expect(agenda).toHaveLength(1)
    // Quand les deux sont vraies, c'est « j'anime » qui décide.
    expect(agenda[0].mine).toBe(true)
  })

  it('une séance annulée quitte les deux agendas', async () => {
    const { trainerUser, profile, community } = await decor()
    const learner = await membre(community.id)
    const { id } = await scheduleLiveSession(community.id, profile.id, trainerUser.id, {
      title: 'Revue de checklists QA', scheduledStartAt: dans(3),
    })

    await cancelLiveSession(id, trainerUser.id)

    expect(await listMyAgenda(learner.id)).toHaveLength(0)
    expect(await listAgenda(trainerUser.id, profile.id)).toHaveLength(0)
    // Elle reste dans la console du formateur, qui montre aussi le passé.
    expect((await listTrainerSessions(profile.id)).map((s) => s.id)).toContain(id)
  })

  it('sans sessions activées, rien ne se programme', async () => {
    const { trainerUser, profile, community } = await decor({ eventsEnabled: false })
    await expect(
      scheduleLiveSession(community.id, profile.id, trainerUser.id, {
        title: 'Revue', scheduledStartAt: dans(3),
      }),
    ).rejects.toThrow('SALON_DISABLED')
  })

  // --- F6.7 : le salon rattaché au replay ----------------------------------

  async function seanceTerminee() {
    const { trainerUser, profile, community } = await decor()
    const learner = await membre(community.id)

    const debut = new Date(Date.now() - 3 * JOUR)
    const session = await prisma.liveSession.create({
      data: {
        communityId: community.id, trainerId: profile.id,
        title: 'Revue de checklists QA', scheduledStartAt: debut,
        status: 'ENDED', startedAt: debut, endedAt: new Date(debut.getTime() + 3_600_000),
        roomName: `nkamva-${Math.random().toString(36).slice(2, 10)}`,
      },
    })
    const replay = await prisma.replay.create({
      data: {
        sessionId: session.id, communityId: community.id, trainerId: profile.id,
        title: session.title, recordedAt: debut, durationSeconds: 3_600,
        status: 'READY', s3Key: 'replays/fixture.mp4',
        purgeAt: new Date(Date.now() + 700 * JOUR),
      },
    })
    return { trainerUser, profile, community, learner, session, replay, debut }
  }

  it('le salon de la séance est rendu avec le replay', async () => {
    const { learner, session, replay, debut } = await seanceTerminee()
    await prisma.liveMessage.create({
      data: {
        sessionId: session.id, authorId: learner.id, body: 'Question sur le point 3',
        createdAt: new Date(debut.getTime() + 12 * 60_000),
      },
    })

    const messages = await listReplayMessages(replay.id, learner.id)
    expect(messages).toHaveLength(1)
    expect(messages[0].body).toBe('Question sur le point 3')
    expect(messages[0].author).toBe('Koffi')
  })

  it('chaque message porte sa position dans la séance', async () => {
    const { learner, session, replay, debut } = await seanceTerminee()
    await prisma.liveMessage.create({
      data: {
        sessionId: session.id, authorId: learner.id, body: 'À la vingtième minute',
        createdAt: new Date(debut.getTime() + 20 * 60_000),
      },
    })

    // C'est ce qui distingue un salon rattaché d'un journal recopié à côté :
    // il sert à retrouver un passage.
    expect((await listReplayMessages(replay.id, learner.id))[0].offsetSeconds).toBe(1_200)
  })

  it("ce qui a été écrit avant l'ouverture de la salle est situé avant le direct", async () => {
    const { learner, session, replay, debut } = await seanceTerminee()
    await prisma.liveMessage.create({
      data: {
        sessionId: session.id, authorId: learner.id, body: 'Je suis en avance',
        createdAt: new Date(debut.getTime() - 5 * 60_000),
      },
    })

    expect((await listReplayMessages(replay.id, learner.id))[0].offsetSeconds).toBe(-300)
  })

  it('un message retiré par la Modération ne revient pas', async () => {
    const { learner, session, replay, debut } = await seanceTerminee()
    await prisma.liveMessage.create({
      data: {
        sessionId: session.id, authorId: learner.id, body: 'Propos instruit',
        createdAt: new Date(debut.getTime() + 60_000), deletedAt: new Date(),
      },
    })

    // Le retrait vaut pour le direct comme pour le replay : sans quoi
    // instruire un propos ne servirait à rien.
    expect(await listReplayMessages(replay.id, learner.id)).toHaveLength(0)
  })

  it('les messages sortent dans leur ordre', async () => {
    const { learner, session, replay, debut } = await seanceTerminee()
    for (const [minute, corps] of [[30, 'troisième'], [5, 'premier'], [12, 'deuxième']] as const) {
      await prisma.liveMessage.create({
        data: {
          sessionId: session.id, authorId: learner.id, body: corps,
          createdAt: new Date(debut.getTime() + minute * 60_000),
        },
      })
    }

    expect((await listReplayMessages(replay.id, learner.id)).map((m) => m.body))
      .toEqual(['premier', 'deuxième', 'troisième'])
  })

  it("qui n'a pas droit au replay n'a pas droit à son salon", async () => {
    const { session, replay, debut, learner } = await seanceTerminee()
    await prisma.liveMessage.create({
      data: {
        sessionId: session.id, authorId: learner.id, body: 'Interne',
        createdAt: new Date(debut.getTime() + 60_000),
      },
    })
    const etranger = await prisma.user.create({
      data: { email: 'etranger@test.com', role: 'LEARNER' },
    })

    await expect(listReplayMessages(replay.id, etranger.id)).rejects.toThrow('NOT_MEMBER')
  })

  it("un replay purgé n'a plus de salon à montrer", async () => {
    const { learner, replay } = await seanceTerminee()
    await prisma.replay.update({
      where: { id: replay.id },
      data: { purgedAt: new Date(), s3Key: null },
    })

    await expect(listReplayMessages(replay.id, learner.id)).rejects.toThrow('REPLAY_NOT_FOUND')
  })
})
