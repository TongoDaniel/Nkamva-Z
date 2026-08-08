// ==========================================================================
// Lives et replays — arbitrages 31 à 43, 46, 51, 55
// ==========================================================================
// Sans clés LiveKit, l'adaptateur rend `null` sans lever : c'est délibéré, et
// c'est ce qui rend ces tests possibles. Ils portent sur les règles — qui entre,
// qui parle, qui garde accès — pas sur le transport, qui n'en a aucune.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  scheduleLiveSession, cancelLiveSession, startLiveSession, endLiveSession,
  joinLiveSession, toggleHand, setParticipantMuted, muteEveryone,
  lowerParticipantHand, postLiveMessage, listMyAgenda, listTrainerSessions, listAgenda,
  listMyReplays, getReplay, hasReplayAccess, markReplayReady,
  purgeExpiredReplays, alertUpcomingReplayPurges, REPLAY_RETENTION_MONTHS,
} from '@/lib/lives'
import { mintJoinToken } from '@/lib/livekit'
import { trainerStorageUsedBytes } from '@/lib/courses'

const DAY = 86_400_000

describe('Lives et replays', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup(overrides: Record<string, unknown> = {}) {
    const trainerUser = await prisma.user.create({
      data: { email: 'formateur@test.com', role: 'TRAINER', fullName: 'Awa Sarr' },
    })
    const trainer = await prisma.trainerProfile.create({
      data: { userId: trainerUser.id, approvedAt: new Date(), slogan: 'Architecture' },
    })
    const community = await prisma.community.create({
      data: {
        trainerId: trainer.id, name: 'Les artisans du back', slug: 'artisans-back',
        priceFcfa: 5000, ...overrides,
      },
    })
    const member = await prisma.user.create({
      data: { email: 'membre@test.com', role: 'LEARNER', fullName: 'Koffi N\'Da' },
    })
    const outsider = await prisma.user.create({ data: { email: 'passant@test.com', role: 'LEARNER' } })
    return { trainerUser, trainer, community, member, outsider }
  }

  function subscribe(
    communityId: string,
    learnerId: string,
    opts: { status?: 'ACTIVE' | 'BANNED' | 'EXPIRED'; startDaysAgo?: number; endDaysAgo?: number } = {},
  ) {
    return prisma.communitySubscription.create({
      data: {
        communityId, learnerId, status: opts.status ?? 'ACTIVE',
        periodStart: new Date(Date.now() - (opts.startDaysAgo ?? 30) * DAY),
        periodEnd: new Date(Date.now() - (opts.endDaysAgo ?? -30) * DAY),
        provider: 'STRIPE',
        ...(opts.status === 'BANNED' ? { bannedAt: new Date() } : {}),
      },
    })
  }

  const schedule = (communityId: string, trainerId: string, userId: string, inHours = 2) =>
    scheduleLiveSession(communityId, trainerId, userId, {
      title: 'Revue de checklists QA',
      description: 'On passe en revue vos checklists.',
      scheduledStartAt: new Date(Date.now() + inHours * 3_600_000),
    })

  // --- Programmer ---

  it('un live appartient à une communauté, et seul son formateur le programme', async () => {
    const { community, trainer, trainerUser } = await setup()
    const other = await prisma.user.create({ data: { email: 'autre@test.com', role: 'TRAINER' } })
    const otherTrainer = await prisma.trainerProfile.create({
      data: { userId: other.id, approvedAt: new Date() },
    })

    await expect(schedule(community.id, otherTrainer.id, other.id)).rejects.toThrow('NOT_OWNER')

    const session = await schedule(community.id, trainer.id, trainerUser.id)
    const stored = await prisma.liveSession.findUniqueOrThrow({ where: { id: session.id } })
    expect(stored.communityId).toBe(community.id)
    expect(stored.status).toBe('SCHEDULED')
    // La salle est nommée à la création, jamais devinée plus tard.
    expect(stored.roomName).toMatch(/^nkamva-/)
  })

  it('une communauté sans sessions activées n\'en programme pas', async () => {
    const { community, trainer, trainerUser } = await setup({ eventsEnabled: false })
    await expect(schedule(community.id, trainer.id, trainerUser.id)).rejects.toThrow('SALON_DISABLED')
  })

  it('les membres sont prévenus, le formateur non', async () => {
    const { community, trainer, trainerUser, member } = await setup()
    await subscribe(community.id, member.id)
    await schedule(community.id, trainer.id, trainerUser.id)

    expect(await prisma.notification.count({ where: { userId: member.id } })).toBe(1)
    expect(await prisma.notification.count({ where: { userId: trainerUser.id } })).toBe(0)
  })

  // --- Entrer ---

  it('arbitrage 46 — la capacité est la communauté : seule l\'adhésion décide', async () => {
    const { community, trainer, trainerUser, member, outsider } = await setup()
    const session = await schedule(community.id, trainer.id, trainerUser.id)

    await expect(joinLiveSession(session.id, outsider.id)).rejects.toThrow('NOT_MEMBER')

    await subscribe(community.id, member.id)
    const room = await joinLiveSession(session.id, member.id)
    expect(room.isHost).toBe(false)
    expect(room.canSpeak).toBe(true)

    // Le formateur entre chez lui sans y adhérer.
    expect((await joinLiveSession(session.id, trainerUser.id)).isHost).toBe(true)
  })

  it('revenir après une coupure reprend la même présence', async () => {
    const { community, trainer, trainerUser, member } = await setup()
    await subscribe(community.id, member.id)
    const session = await schedule(community.id, trainer.id, trainerUser.id)

    await joinLiveSession(session.id, member.id)
    await joinLiveSession(session.id, member.id)

    // Sans cette unicité, la file des demandes de parole serait une loterie.
    expect(await prisma.liveParticipant.count({ where: { sessionId: session.id } })).toBe(1)
  })

  // --- Ouvrir, clore ---

  it('ouvrir déclenche l\'enregistrement, clore produit le replay', async () => {
    const { community, trainer, trainerUser, member } = await setup()
    await subscribe(community.id, member.id)
    const session = await schedule(community.id, trainer.id, trainerUser.id)

    await expect(endLiveSession(session.id, trainerUser.id)).rejects.toThrow('LIVE_NOT_STARTED')

    await startLiveSession(session.id, trainerUser.id)
    expect((await prisma.liveSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe('LIVE')

    const result = await endLiveSession(session.id, trainerUser.id)
    // Sans transport configuré, aucun egress : le replay existe quand même,
    // en échec. L'arbitrage 38 promet qu'il existe systématiquement.
    expect(result.recorded).toBe(false)

    const replay = await prisma.replay.findUniqueOrThrow({ where: { sessionId: session.id } })
    expect(replay.status).toBe('FAILED')
    // Arbitrage 34 — la date du live fait foi, et la purge court depuis elle.
    const months =
      (replay.purgeAt.getFullYear() - replay.recordedAt.getFullYear()) * 12 +
      (replay.purgeAt.getMonth() - replay.recordedAt.getMonth())
    expect(months).toBe(REPLAY_RETENTION_MONTHS)
  })

  it('seul l\'hôte ouvre, clôt et annule', async () => {
    const { community, trainer, trainerUser, member } = await setup()
    await subscribe(community.id, member.id)
    const session = await schedule(community.id, trainer.id, trainerUser.id)

    await expect(startLiveSession(session.id, member.id)).rejects.toThrow('NOT_OWNER')
    await expect(cancelLiveSession(session.id, member.id)).rejects.toThrow('NOT_OWNER')

    await cancelLiveSession(session.id, trainerUser.id)
    await expect(joinLiveSession(session.id, member.id)).rejects.toThrow('LIVE_CANCELED')
  })

  // --- Parole (arbitrages 35, 36, 40, 41) ---

  it('arbitrage 36 — la file est ordonnée par horodatage, et numérotée', async () => {
    const { community, trainer, trainerUser, member } = await setup()
    const second = await prisma.user.create({
      data: { email: 'second@test.com', role: 'LEARNER', fullName: 'Sara Diop' },
    })
    await subscribe(community.id, member.id)
    await subscribe(community.id, second.id)
    const session = await schedule(community.id, trainer.id, trainerUser.id)
    await startLiveSession(session.id, trainerUser.id)
    await joinLiveSession(session.id, member.id)
    await joinLiveSession(session.id, second.id)

    await toggleHand(session.id, member.id, true)
    await new Promise((r) => setTimeout(r, 15))
    await toggleHand(session.id, second.id, true)

    const room = await joinLiveSession(session.id, second.id)
    expect(room.handPosition).toBe(2)
    const first = await joinLiveSession(session.id, member.id)
    expect(first.handPosition).toBe(1)
  })

  it('arbitrage 41 — donner la parole lève le verrou et baisse la main', async () => {
    const { community, trainer, trainerUser, member } = await setup()
    await subscribe(community.id, member.id)
    const session = await schedule(community.id, trainer.id, trainerUser.id)
    await startLiveSession(session.id, trainerUser.id)
    await joinLiveSession(session.id, member.id)

    await setParticipantMuted(session.id, member.id, trainerUser.id, true)
    await toggleHand(session.id, member.id, true)

    let state = await prisma.liveParticipant.findFirstOrThrow({ where: { sessionId: session.id, userId: member.id } })
    expect(state.mutedByHost).toBe(true)
    expect(state.handRaisedAt).not.toBeNull()

    await setParticipantMuted(session.id, member.id, trainerUser.id, false)

    state = await prisma.liveParticipant.findFirstOrThrow({ where: { sessionId: session.id, userId: member.id } })
    expect(state.mutedByHost).toBe(false)
    // D'un même geste : laisser la main levée ferait figurer dans la file
    // quelqu'un qui a déjà obtenu ce qu'il demandait.
    expect(state.handRaisedAt).toBeNull()
  })

  it('retirer une demande ne rend pas le micro', async () => {
    const { community, trainer, trainerUser, member } = await setup()
    await subscribe(community.id, member.id)
    const session = await schedule(community.id, trainer.id, trainerUser.id)
    await startLiveSession(session.id, trainerUser.id)
    await joinLiveSession(session.id, member.id)
    await setParticipantMuted(session.id, member.id, trainerUser.id, true)
    await toggleHand(session.id, member.id, true)

    await lowerParticipantHand(session.id, member.id, trainerUser.id)

    const state = await prisma.liveParticipant.findFirstOrThrow({ where: { sessionId: session.id, userId: member.id } })
    expect(state.handRaisedAt).toBeNull()
    expect(state.mutedByHost).toBe(true)
  })

  it('couper tout le monde épargne l\'animateur', async () => {
    const { community, trainer, trainerUser, member } = await setup()
    await subscribe(community.id, member.id)
    const session = await schedule(community.id, trainer.id, trainerUser.id)
    await startLiveSession(session.id, trainerUser.id)
    await joinLiveSession(session.id, member.id)
    await joinLiveSession(session.id, trainerUser.id)

    const { muted } = await muteEveryone(session.id, trainerUser.id)
    expect(muted).toBe(1)

    const host = await prisma.liveParticipant.findFirstOrThrow({ where: { sessionId: session.id, userId: trainerUser.id } })
    expect(host.mutedByHost).toBe(false)
    await expect(setParticipantMuted(session.id, trainerUser.id, trainerUser.id, true))
      .rejects.toThrow('CANNOT_MUTE_HOST')
  })

  it('arbitrage 40 — le membre banni assiste, sans prendre la parole', async () => {
    const { community, trainer, trainerUser, member } = await setup()
    await subscribe(community.id, member.id, { status: 'BANNED' })
    const session = await schedule(community.id, trainer.id, trainerUser.id)
    await startLiveSession(session.id, trainerUser.id)

    // Il **entre** : couper la parole n'est pas exclure de la séance.
    const room = await joinLiveSession(session.id, member.id)
    expect(room.canSpeak).toBe(false)
    expect(room.mutedReason).toBe('BANNED')

    await expect(toggleHand(session.id, member.id, true)).rejects.toThrow('MEMBER_BANNED')
    await expect(postLiveMessage(session.id, member.id, 'Bonjour')).rejects.toThrow('MEMBER_BANNED')
  })

  it('le jeton de salle porte l\'interdit, pas l\'écran', async () => {
    // La suite tourne sans transport configuré, par hermétisme : on le rend ici
    // le temps d'un test. `mintJoinToken` ne fait que signer — aucun appel
    // réseau, aucune salle ouverte chez le fournisseur.
    const saved = {
      url: process.env.LIVEKIT_URL,
      key: process.env.LIVEKIT_API_KEY,
      secret: process.env.LIVEKIT_API_SECRET,
    }
    process.env.LIVEKIT_URL = 'wss://exemple.invalid'
    process.env.LIVEKIT_API_KEY = 'APIfaux'
    process.env.LIVEKIT_API_SECRET = 'secretdetestsuffisammentlong0123456789'

    try {
      const token = await mintJoinToken({
        roomName: 'nkamva-test',
        identity: 'u1',
        name: 'Koffi',
        canPublish: false,
        isHost: false,
      })
      const grant = JSON.parse(Buffer.from(token!.split('.')[1], 'base64url').toString('utf8'))

      // Le droit de publier vit dans le jeton, signé par le serveur : la console
      // du navigateur ne peut pas le retourner. C'est ce qui fait du verrou de
      // l'arbitrage 35 une règle et non une politesse d'interface.
      expect(grant.video.roomJoin).toBe(true)
      expect(grant.video.canPublish).toBe(false)
      // La donnée reste ouverte : c'est par elle que passe la main levée, seul
      // recours d'un participant sans micro (arbitrage 41).
      expect(grant.video.canPublishData).toBe(true)
    } finally {
      process.env.LIVEKIT_URL = saved.url ?? ''
      process.env.LIVEKIT_API_KEY = saved.key ?? ''
      process.env.LIVEKIT_API_SECRET = saved.secret ?? ''
    }
  })

  // --- Salon (arbitrage 42) ---

  it('arbitrage 42 — le salon survit à la séance', async () => {
    const { community, trainer, trainerUser, member } = await setup()
    await subscribe(community.id, member.id)
    const session = await schedule(community.id, trainer.id, trainerUser.id)
    await startLiveSession(session.id, trainerUser.id)
    await joinLiveSession(session.id, member.id)
    await postLiveMessage(session.id, member.id, 'Le replay sera dispo ?')

    await endLiveSession(session.id, trainerUser.id)

    const room = await joinLiveSession(session.id, member.id)
    expect(room.messages.map((m) => m.body)).toEqual(['Le replay sera dispo ?'])
  })

  // --- Accès aux replays (arbitrages 34, 44, 55) ---

  async function replayFor(communityId: string, trainerId: string, trainerUserId: string, memberId: string) {
    const session = await schedule(communityId, trainerId, trainerUserId)
    await startLiveSession(session.id, trainerUserId)
    await endLiveSession(session.id, trainerUserId)
    await markReplayReady(session.id, { s3Key: `replays/${session.id}/x.mp4`, sizeBytes: 3_000_000_000 })
    void memberId
    return prisma.replay.findUniqueOrThrow({ where: { sessionId: session.id } })
  }

  it('arbitrage 44 — un membre actuel voit tout, sans filtre de date', async () => {
    const { community, trainer, trainerUser, member } = await setup()
    const replay = await replayFor(community.id, trainer.id, trainerUser.id, member.id)

    // Adhésion ouverte APRÈS l'enregistrement : elle donne quand même accès.
    await subscribe(community.id, member.id, { startDaysAgo: -1 })
    expect(await hasReplayAccess(member.id, replay)).toBe(true)
    expect((await listMyReplays(member.id)).map((r) => r.id)).toEqual([replay.id])
  })

  it('arbitrage 34 — un ancien membre garde ce qui a été enregistré pendant son passage', async () => {
    const { community, trainer, trainerUser, member } = await setup()
    const replay = await replayFor(community.id, trainer.id, trainerUser.id, member.id)

    // Adhésion close, mais qui couvrait la date du live.
    await subscribe(community.id, member.id, {
      status: 'EXPIRED', startDaysAgo: 10, endDaysAgo: -1,
    })
    expect(await hasReplayAccess(member.id, replay)).toBe(true)
  })

  it('un ancien membre n\'a pas ce qui a été enregistré après son départ', async () => {
    const { community, trainer, trainerUser, member } = await setup()
    const replay = await replayFor(community.id, trainer.id, trainerUser.id, member.id)

    await subscribe(community.id, member.id, {
      status: 'EXPIRED', startDaysAgo: 90, endDaysAgo: 30,
    })
    expect(await hasReplayAccess(member.id, replay)).toBe(false)
    await expect(getReplay(replay.id, member.id)).rejects.toThrow('NOT_MEMBER')
  })

  it('arbitrage 55 — le téléchargement est un droit uniforme du membre', async () => {
    const { community, trainer, trainerUser, member } = await setup()
    const replay = await replayFor(community.id, trainer.id, trainerUser.id, member.id)
    await subscribe(community.id, member.id)

    const view = await getReplay(replay.id, member.id)
    // Aucune case par séance : c'est l'état de l'enregistrement qui décide, pas
    // une autorisation du formateur.
    expect(view.downloadable).toBe(true)
  })

  // --- Stockage et purge (arbitrages 51 et 54) ---

  it('arbitrage 54 — un replay pèse sur le quota du formateur', async () => {
    const { community, trainer, trainerUser, member } = await setup()
    expect(await trainerStorageUsedBytes(trainer.id)).toBe(0)

    await replayFor(community.id, trainer.id, trainerUser.id, member.id)

    // 3 Go : au-delà d'un entier 32 bits, d'où la colonne BIGINT.
    expect(await trainerStorageUsedBytes(trainer.id)).toBe(3_000_000_000)
  })

  it('arbitrage 51 — la purge à 24 mois rend l\'espace au formateur', async () => {
    const { community, trainer, trainerUser, member } = await setup()
    const replay = await replayFor(community.id, trainer.id, trainerUser.id, member.id)

    expect((await purgeExpiredReplays()).purged).toBe(0)

    const after = new Date(replay.purgeAt.getTime() + DAY)
    expect((await purgeExpiredReplays(after)).purged).toBe(1)

    const purged = await prisma.replay.findUniqueOrThrow({ where: { id: replay.id } })
    expect(purged.status).toBe('PURGED')
    expect(purged.s3Key).toBeNull()
    // La ligne survit : un membre qui cherche pourquoi doit trouver une réponse.
    expect(await trainerStorageUsedBytes(trainer.id)).toBe(0)
  })

  it('le formateur est prévenu un mois avant la purge', async () => {
    const { community, trainer, trainerUser, member } = await setup()
    const replay = await replayFor(community.id, trainer.id, trainerUser.id, member.id)

    expect((await alertUpcomingReplayPurges()).alerted).toBe(0)

    const soon = new Date(replay.purgeAt.getTime() - 10 * DAY)
    expect((await alertUpcomingReplayPurges(soon)).alerted).toBe(1)
    expect(
      await prisma.notification.count({ where: { userId: trainerUser.id, type: 'REPLAY_PURGE_SOON' } }),
    ).toBe(1)
  })

  // --- Agendas ---

  it('l\'agenda ne montre que les communautés rejointes', async () => {
    const { community, trainer, trainerUser, member, outsider } = await setup()
    await schedule(community.id, trainer.id, trainerUser.id)

    expect(await listMyAgenda(outsider.id)).toHaveLength(0)
    await subscribe(community.id, member.id)
    const agenda = await listMyAgenda(member.id)
    expect(agenda).toHaveLength(1)
    expect(agenda[0].community.name).toBe('Les artisans du back')
    expect(agenda[0].host.name).toBe('Awa Sarr')
    expect(agenda[0].live).toBe(false)
  })

  it('la console du formateur montre aussi le passé', async () => {
    const { community, trainer, trainerUser } = await setup()
    const session = await schedule(community.id, trainer.id, trainerUser.id)
    await startLiveSession(session.id, trainerUser.id)
    await endLiveSession(session.id, trainerUser.id)

    const mine = await listTrainerSessions(trainer.id)
    expect(mine).toHaveLength(1)
    expect(mine[0].status).toBe('ENDED')
  })

  // --- Agenda fusionné ---

  /** Une seconde communauté, animée par quelqu'un d'autre. */
  async function otherSpace(tag: string) {
    const user = await prisma.user.create({
      data: { email: `formateur-${tag}@test.com`, role: 'TRAINER', fullName: 'Kofi Mensah' },
    })
    const trainer = await prisma.trainerProfile.create({
      data: { userId: user.id, approvedAt: new Date() },
    })
    const community = await prisma.community.create({
      data: {
        trainerId: trainer.id, name: `Cercle ${tag}`, slug: `cercle-${tag}`, priceFcfa: 5000,
      },
    })
    return { user, trainer, community }
  }

  it("l'agenda réunit ce qu'on anime et ce qu'on suit, et dit lequel", async () => {
    const { community, trainer, trainerUser } = await setup()
    const other = await otherSpace('agenda')

    // La formatrice anime chez elle, et suit la communauté de l'autre.
    await schedule(community.id, trainer.id, trainerUser.id, 5)
    await schedule(other.community.id, other.trainer.id, other.user.id, 2)
    await subscribe(other.community.id, trainerUser.id)

    const agenda = await listAgenda(trainerUser.id, trainer.id)
    expect(agenda).toHaveLength(2)
    expect(agenda.filter((s) => s.mine)).toHaveLength(1)
    expect(agenda.filter((s) => !s.mine)).toHaveLength(1)
    // Ordonné par date de début, toutes origines confondues : la séance suivie
    // est deux heures avant celle qu'elle anime, elle passe donc devant.
    expect(agenda[0].mine).toBe(false)
    expect(agenda[1].mine).toBe(true)
  })

  it("une séance terminée quitte l'agenda et rejoint ses replays", async () => {
    const { community, trainer, trainerUser } = await setup()
    const session = await schedule(community.id, trainer.id, trainerUser.id)
    await startLiveSession(session.id, trainerUser.id)
    await endLiveSession(session.id, trainerUser.id)

    expect(await listAgenda(trainerUser.id, trainer.id)).toHaveLength(0)
    expect(await listTrainerSessions(trainer.id)).toHaveLength(1)
  })

  it('sans profil formateur, tout l\'agenda vient des communautés rejointes', async () => {
    const { community, trainer, trainerUser, member } = await setup()
    await schedule(community.id, trainer.id, trainerUser.id)
    await subscribe(community.id, member.id)

    const agenda = await listAgenda(member.id, null)
    expect(agenda).toHaveLength(1)
    expect(agenda[0].mine).toBe(false)
  })

  it('« mes replays » distingue ceux que j\'ai produits de ceux que je suis', async () => {
    const { community, trainer, trainerUser, member } = await setup()
    const else_ = await otherSpace('replays')

    const own = await replayFor(community.id, trainer.id, trainerUser.id, member.id)
    const other = await replayFor(else_.community.id, else_.trainer.id, else_.user.id, member.id)
    await subscribe(else_.community.id, trainerUser.id)

    const replays = await listMyReplays(trainerUser.id)
    const byId = new Map(replays.map((r) => [r.id, r.mine]))
    expect(byId.get(own.id)).toBe(true)
    // C'est exactement le chiffre que « replays enregistrés » comptait faux :
    // l'abonnement d'un formateur ailleurs gonflait sa propre production.
    expect(byId.get(other.id)).toBe(false)
    expect(replays.filter((r) => r.mine)).toHaveLength(1)
  })
})
