// ==========================================================================
// Lives et replays — arbitrages 31 à 43, 46, 51, 55
// ==========================================================================
// Six écrans complets attendaient ces modèles depuis le Lot 0. Ce module les
// leur donne, et ne connaît du fournisseur temps réel que les quatre verbes de
// `livekit.ts` : le jour où le transport change, rien d'ici ne bouge.
//
// Deux principes, qui reviennent partout dans ce fichier :
//
// 1. **Couper n'est pas exclure** (arbitrages 35, 40, 41). Le formateur pose et
//    lève un verrou de micro ; il ne retire personne de la séance. Écarter
//    durablement relève du bannissement de communauté, qui vit ailleurs.
//    Et lever le verrou **rend la commande** au participant, cela ne l'actionne
//    pas à sa place.
// 2. **Ce qui est enregistré ne se décide pas** (arbitrage 38). Tout live est
//    enregistré ; il n'y a pas de case à cocher au lancement, et il n'y en aura
//    pas. Un replay existe donc systématiquement — au pire en échec.
//
// L'accès aux replays est la seule règle vraiment subtile, et elle vient de la
// rencontre des arbitrages 34 et 44 :
//
//     membre actuel  → tout, sans filtre de date
//     ancien membre  → les replays dont **la date du live** tombe dans une de
//                      ses périodes d'adhésion
//
// C'est la date du live qui fait foi, jamais celle de la mise en ligne de
// l'enregistrement (arbitrage 34, explicitement).
// ==========================================================================

import type { LiveSessionStatus } from '@prisma/client'
import { db } from './db'
import { audit, auditStandalone } from './audit'
import { notify, deliverSideEffects } from './notification'
import { presignDownload } from './s3'
import {
  isLiveKitConfigured, livekitUrl, mintJoinToken, ensureRoom, closeRoom,
  setParticipantCanPublish, countConnected, startRecording, startStreamRecording, stopRecording,
  getEgressOutcome,
} from './livekit'
import {
  isMuxConfigured, createLiveStream, disableLiveStream, playbackUrl, downloadUrl,
} from './mux'

/** Voir `memberships.ts` — les listes de statuts ouverts restent alignées. */
const OPEN_STATUSES = ['ACTIVE', 'PAST_DUE', 'BANNED'] as const

/** Arbitrage 51 — un replay vit 24 mois, puis rend son espace au formateur. */
export const REPLAY_RETENTION_MONTHS = 24

export const LIVE_MESSAGE_MAX_LENGTH = 2000

// --- Qui est le spectateur ---

interface LiveViewer {
  userId: string
  communityId: string
  isTrainer: boolean
  subscriptionStatus: (typeof OPEN_STATUSES)[number] | null
  sanctionLevel: string
}

async function resolveViewer(communityId: string, userId: string): Promise<LiveViewer> {
  const [community, subscription, user] = await Promise.all([
    db.community.findUnique({
      where: { id: communityId },
      select: { trainerProfile: { select: { userId: true } } },
    }),
    db.communitySubscription.findFirst({
      where: { communityId, learnerId: userId, status: { in: [...OPEN_STATUSES] } },
      select: { status: true },
    }),
    db.user.findUnique({ where: { id: userId }, select: { sanctionLevel: true } }),
  ])
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')

  return {
    userId,
    communityId,
    isTrainer: community.trainerProfile.userId === userId,
    subscriptionStatus: (subscription?.status as LiveViewer['subscriptionStatus']) ?? null,
    sanctionLevel: user?.sanctionLevel ?? 'NONE',
  }
}

/**
 * Entrer dans la séance. La capacité est la communauté elle-même (arbitrage 46) :
 * aucune jauge, aucun refus pour cause de place. Seule l'adhésion décide.
 */
function assertCanAttend(viewer: LiveViewer): void {
  if (viewer.sanctionLevel === 'BANNED') throw new Error('ACCOUNT_BANNED')
  if (viewer.isTrainer) return
  if (!viewer.subscriptionStatus) throw new Error('NOT_MEMBER')
}

/**
 * Prendre la parole — micro, main levée, salon. Le membre banni de la
 * communauté assiste sans parler : c'est le même patron que le forum, et c'est
 * ce que dit l'arbitrage 40 en refusant l'exclusion en séance.
 */
function mutedReason(viewer: LiveViewer): 'BANNED' | 'RESTRICTED' | null {
  if (viewer.sanctionLevel === 'RESTRICTED') return 'RESTRICTED'
  if (viewer.subscriptionStatus === 'BANNED') return 'BANNED'
  return null
}

function assertCanSpeak(viewer: LiveViewer): void {
  assertCanAttend(viewer)
  const reason = mutedReason(viewer)
  if (reason === 'RESTRICTED') throw new Error('ACCOUNT_RESTRICTED')
  if (reason === 'BANNED') throw new Error('MEMBER_BANNED')
}

async function assertIsHost(sessionId: string, userId: string) {
  const session = await db.liveSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true, communityId: true, roomName: true, status: true,
      community: { select: { trainerProfile: { select: { userId: true } } } },
    },
  })
  if (!session) throw new Error('LIVE_SESSION_NOT_FOUND')
  if (session.community.trainerProfile.userId !== userId) throw new Error('NOT_OWNER')
  return session
}

// --- Programmer une séance ---

export async function scheduleLiveSession(
  communityId: string,
  trainerProfileId: string,
  userId: string,
  input: { title: string; description?: string | null; scheduledStartAt: Date; durationMinutes?: number },
): Promise<{ id: string }> {
  const title = input.title.trim()
  if (!title) throw new Error('TITLE_REQUIRED')

  const community = await db.community.findFirst({
    where: { id: communityId, status: 'active' },
    select: { id: true, trainerId: true, name: true, slug: true, eventsEnabled: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')
  if (community.trainerId !== trainerProfileId) throw new Error('NOT_OWNER')
  if (!community.eventsEnabled) throw new Error('SALON_DISABLED')

  // Le nom de salle est tiré ici et enregistré : le deviner plus tard à partir
  // de l'identifiant est exactement l'erreur qui a rompu la chaîne de contenu
  // des ressources — une clé jamais écrite, signée quand même.
  const roomName = `nkamva-${crypto.randomUUID()}`

  const session = await db.$transaction(async (tx) => {
    const created = await tx.liveSession.create({
      data: {
        communityId: community.id,
        trainerId: trainerProfileId,
        title,
        description: input.description?.trim() || null,
        scheduledStartAt: input.scheduledStartAt,
        durationMinutes: input.durationMinutes ?? 60,
        roomName,
      },
      select: { id: true },
    })
    await audit(tx, {
      actorId: userId, actorRole: 'TRAINER',
      action: 'LIVE_SESSION_SCHEDULED', targetType: 'LiveSession', targetId: created.id,
      meta: { communityId: community.id, scheduledStartAt: input.scheduledStartAt.toISOString() },
    })
    return created
  })

  await deliverSideEffects('LIVE_SCHEDULED', { type: 'LiveSession', id: session.id }, () =>
    notifyMembers(community.id, userId, {
      type: 'LIVE_SCHEDULED',
      title: `Nouvelle session dans ${community.name}`,
      body: `${title} — le ${input.scheduledStartAt.toLocaleDateString('fr-FR', { dateStyle: 'long' })}.`,
      link: '/mes-lives',
    }),
  )

  return session
}

export async function cancelLiveSession(sessionId: string, userId: string): Promise<void> {
  const session = await assertIsHost(sessionId, userId)
  if (session.status === 'ENDED') throw new Error('LIVE_ALREADY_ENDED')

  await db.$transaction(async (tx) => {
    await tx.liveSession.update({ where: { id: sessionId }, data: { status: 'CANCELED' } })
    await audit(tx, {
      actorId: userId, actorRole: 'TRAINER',
      action: 'LIVE_SESSION_CANCELED', targetType: 'LiveSession', targetId: sessionId,
      meta: { communityId: session.communityId },
    })
  })

  if (session.status === 'LIVE') await closeRoom(session.roomName)
}

// --- Ouvrir et clore la séance ---

/**
 * Ouvre la salle et **déclenche l'enregistrement** (arbitrage 38 : aucune
 * décision au lancement). L'échec de l'egress n'empêche pas la séance : mieux
 * vaut un live sans replay qu'un live qui n'a pas lieu.
 */
export async function startLiveSession(sessionId: string, userId: string) {
  const session = await assertIsHost(sessionId, userId)
  if (session.status === 'ENDED' || session.status === 'CANCELED') throw new Error('LIVE_ALREADY_ENDED')
  if (session.status === 'LIVE') return { id: sessionId, alreadyLive: true }

  await ensureRoom(session.roomName)

  const startedAt = new Date()

  // Mux enregistre quand il est configuré ; sinon l'egress dépose un fichier
  // dans le stockage objet. Les deux chemins produisent un replay — c'est ce
  // que l'arbitrage 38 exige, pas un fournisseur en particulier.
  const stream = await createLiveStream()
  const egressId = stream
    ? await startStreamRecording(session.roomName, stream.rtmpUrl)
    : await startRecording(session.roomName, `replays/${sessionId}/enregistrement.mp4`)

  await db.$transaction(async (tx) => {
    await tx.liveSession.update({
      where: { id: sessionId },
      data: { status: 'LIVE', startedAt, egressId, muxStreamId: stream?.streamId ?? null },
    })
    await audit(tx, {
      actorId: userId, actorRole: 'TRAINER',
      action: 'LIVE_SESSION_STARTED', targetType: 'LiveSession', targetId: sessionId,
      meta: {
        communityId: session.communityId,
        recording: Boolean(egressId),
        recorder: stream ? 'MUX' : egressId ? 'STORAGE' : null,
      },
    })
  })

  return { id: sessionId, alreadyLive: false }
}

/**
 * Clôt la séance et ouvre le replay. Le replay est créé même quand
 * l'enregistrement a échoué — en `FAILED` : l'arbitrage 38 promet qu'un replay
 * existe systématiquement, et une promesse tenue à moitié se constate mieux
 * qu'elle ne se devine.
 */
export async function endLiveSession(sessionId: string, userId: string) {
  const session = await assertIsHost(sessionId, userId)
  if (session.status !== 'LIVE') throw new Error('LIVE_NOT_STARTED')

  const full = await db.liveSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: {
      id: true, communityId: true, trainerId: true, title: true,
      startedAt: true, egressId: true, roomName: true, muxStreamId: true,
      community: { select: { name: true, slug: true } },
    },
  })

  if (full.egressId) await stopRecording(full.egressId)
  // Le flux d'ingestion se ferme ; l'asset déjà produit, lui, survit et
  // arrivera par webhook.
  if (full.muxStreamId) await disableLiveStream(full.muxStreamId)
  await closeRoom(full.roomName)

  const endedAt = new Date()
  // Arbitrage 34 — c'est la date du live qui fait foi. On date le replay du
  // **début** de la séance, pas de la fin de son encodage.
  const recordedAt = full.startedAt ?? endedAt
  const purgeAt = new Date(recordedAt)
  purgeAt.setMonth(purgeAt.getMonth() + REPLAY_RETENTION_MONTHS)

  await db.$transaction(async (tx) => {
    await tx.liveSession.update({
      where: { id: sessionId },
      data: { status: 'ENDED', endedAt },
    })
    await tx.liveParticipant.updateMany({
      where: { sessionId, leftAt: null },
      data: { leftAt: endedAt },
    })
    await tx.replay.create({
      data: {
        sessionId,
        communityId: full.communityId,
        trainerId: full.trainerId,
        title: full.title,
        recordedAt,
        durationSeconds: Math.max(0, Math.round((endedAt.getTime() - recordedAt.getTime()) / 1000)),
        // Un replay hébergé par Mux n'a pas de clé chez nous : c'est le
        // webhook qui apportera son identifiant de lecture.
        s3Key: full.egressId && !full.muxStreamId
          ? `replays/${sessionId}/enregistrement.mp4`
          : null,
        status: full.egressId ? 'PROCESSING' : 'FAILED',
        purgeAt,
      },
    })
    await audit(tx, {
      actorId: userId, actorRole: 'TRAINER',
      action: 'LIVE_SESSION_ENDED', targetType: 'LiveSession', targetId: sessionId,
      meta: { communityId: full.communityId, recorded: Boolean(full.egressId) },
    })
  })

  await deliverSideEffects('LIVE_ENDED', { type: 'LiveSession', id: sessionId }, () =>
    notifyMembers(full.communityId, userId, {
      type: 'REPLAY_AVAILABLE',
      title: `Le replay de « ${full.title} » arrive`,
      body: 'La séance est terminée. Son enregistrement sera disponible dans quelques minutes.',
      link: '/mes-lives',
    }),
  )

  return { ended: true, recorded: Boolean(full.egressId) }
}

// --- Participer ---

export interface LiveRoomView {
  id: string
  /** Qui regarde — l'écran s'en sert pour se reconnaître dans la liste. */
  viewerId: string
  title: string
  description: string | null
  status: LiveSessionStatus
  startsAt: Date
  durationMinutes: number
  startedAt: Date | null
  attendees: number
  community: ViewCommunity
  host: ViewHost
  /** La séance est-elle en cours ? */
  live: boolean
  isHost: boolean
  /** Faux pour un membre banni ou un compte restreint : il assiste, il ne parle pas. */
  canSpeak: boolean
  mutedReason: 'BANNED' | 'RESTRICTED' | null
  /** Verrou posé par l'animateur sur *ce* participant (arbitrage 35). */
  mutedByHost: boolean
  handRaisedAt: Date | null
  /** Rang dans la file des demandes de parole (arbitrage 36), 1 = premier. */
  handPosition: number | null
  participants: Array<{
    userId: string
    name: string | null
    isHost: boolean
    mutedByHost: boolean
    handRaisedAt: Date | null
    handPosition: number | null
  }>
  messages: Array<{
    id: string
    authorId: string
    authorName: string | null
    /** Nul quand le message a été retiré par la Modération. */
    body: string | null
    createdAt: Date
    deleted: boolean
  }>
  /** Jeton de salle. Nul quand le transport n'est pas configuré. */
  token: string | null
  serverUrl: string | null
  transportConfigured: boolean
}

/**
 * Ouvre la salle pour un participant : enregistre sa présence, mesure le pic de
 * fréquentation, et rend tout ce que l'écran doit afficher — y compris le jeton.
 */
export async function joinLiveSession(sessionId: string, userId: string): Promise<LiveRoomView> {
  const session = await db.liveSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true, communityId: true, title: true, description: true, status: true,
      scheduledStartAt: true, durationMinutes: true, startedAt: true, roomName: true,
      community: {
        select: {
          name: true, slug: true,
          trainerProfile: {
            select: { userId: true, slogan: true, user: { select: { fullName: true } } },
          },
        },
      },
    },
  })
  if (!session) throw new Error('LIVE_SESSION_NOT_FOUND')
  if (session.status === 'CANCELED') throw new Error('LIVE_CANCELED')

  const viewer = await resolveViewer(session.communityId, userId)
  assertCanAttend(viewer)

  const muted = mutedReason(viewer)

  // Une seule ligne de présence par personne : revenir après une coupure reprend
  // la même, avec son verrou de micro et sa main levée. Les perdre à chaque
  // reconnexion ferait de la file des demandes une loterie.
  const participant = await db.liveParticipant.upsert({
    where: { sessionId_userId: { sessionId, userId } },
    create: { sessionId, userId },
    update: { leftAt: null },
    select: { mutedByHost: true, handRaisedAt: true },
  })

  const [participants, messages] = await Promise.all([
    db.liveParticipant.findMany({
      where: { sessionId, leftAt: null },
      orderBy: { joinedAt: 'asc' },
      select: {
        userId: true, mutedByHost: true, handRaisedAt: true,
        user: { select: { fullName: true } },
      },
    }),
    db.liveMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: {
        id: true, authorId: true, body: true, createdAt: true, deletedAt: true,
        author: { select: { fullName: true } },
      },
    }),
  ])

  // Le pic ne redescend jamais : c'est ce qu'on veut savoir d'une séance passée.
  if (session.status === 'LIVE') {
    await db.liveSession.updateMany({
      where: { id: sessionId, peakParticipants: { lt: participants.length } },
      data: { peakParticipants: participants.length },
    })
  }

  const hostUserId = session.community.trainerProfile.userId
  const raised = participants
    .filter((p) => p.handRaisedAt)
    .sort((a, b) => a.handRaisedAt!.getTime() - b.handRaisedAt!.getTime())
  const positionOf = (id: string) => {
    const index = raised.findIndex((p) => p.userId === id)
    return index === -1 ? null : index + 1
  }

  // Le micro n'est ouvert que si rien ne s'y oppose : ni verrou d'animateur, ni
  // bannissement, ni restriction de compte. L'animateur, lui, publie toujours.
  const canPublish = viewer.isTrainer || (!participant.mutedByHost && muted === null)
  const token = session.status === 'LIVE'
    ? await mintJoinToken({
        roomName: session.roomName,
        identity: userId,
        name: viewer.isTrainer
          ? session.community.trainerProfile.user.fullName ?? 'Animateur'
          : participants.find((p) => p.userId === userId)?.user.fullName ?? 'Participant',
        canPublish,
        isHost: viewer.isTrainer,
      })
    : null

  return {
    id: session.id,
    viewerId: userId,
    title: session.title,
    description: session.description,
    status: session.status,
    startsAt: session.scheduledStartAt,
    durationMinutes: session.durationMinutes,
    startedAt: session.startedAt,
    attendees: participants.length,
    community: { name: session.community.name, slug: session.community.slug },
    host: {
      name: session.community.trainerProfile.user.fullName ?? 'Formateur NkamVa',
      role: session.community.trainerProfile.slogan ?? 'Formateur',
    },
    live: session.status === 'LIVE',
    isHost: viewer.isTrainer,
    canSpeak: muted === null,
    mutedReason: muted,
    mutedByHost: participant.mutedByHost,
    handRaisedAt: participant.handRaisedAt,
    handPosition: positionOf(userId),
    participants: participants.map((p) => ({
      userId: p.userId,
      name: p.user.fullName,
      isHost: p.userId === hostUserId,
      mutedByHost: p.mutedByHost,
      handRaisedAt: p.handRaisedAt,
      handPosition: positionOf(p.userId),
    })),
    // Un message retiré garde sa place et son auteur, jamais son texte.
    messages: messages.map((m) => ({
      id: m.id,
      authorId: m.authorId,
      authorName: m.author.fullName,
      body: m.deletedAt ? null : m.body,
      createdAt: m.createdAt,
      deleted: m.deletedAt !== null,
    })),
    token,
    serverUrl: livekitUrl(),
    transportConfigured: isLiveKitConfigured(),
  }
}

export async function leaveLiveSession(sessionId: string, userId: string): Promise<void> {
  await db.liveParticipant.updateMany({
    where: { sessionId, userId, leftAt: null },
    data: { leftAt: new Date(), handRaisedAt: null },
  })
}

// --- Demander la parole (arbitrages 36 et 41) ---

/**
 * Lève ou baisse la main. C'est le **seul** canal pour demander son micro,
 * y compris après avoir été coupé par l'animateur (arbitrage 41) : il n'y a pas
 * de demande de réouverture distincte, et il ne faut pas en ajouter.
 */
export async function toggleHand(sessionId: string, userId: string, raised: boolean) {
  const session = await db.liveSession.findUnique({
    where: { id: sessionId },
    select: { id: true, communityId: true, status: true },
  })
  if (!session) throw new Error('LIVE_SESSION_NOT_FOUND')
  if (session.status !== 'LIVE') throw new Error('LIVE_NOT_STARTED')

  const viewer = await resolveViewer(session.communityId, userId)
  assertCanSpeak(viewer)

  await db.liveParticipant.update({
    where: { sessionId_userId: { sessionId, userId } },
    data: { handRaisedAt: raised ? new Date() : null },
  })

  return { raised }
}

// --- Modérer (arbitrages 35, 40, 41) ---

/**
 * Pose ou lève le verrou de micro d'un participant.
 *
 * Lever le verrou **rend la commande** au participant, cela ne rallume pas son
 * micro à sa place (arbitrage 41). Côté transport, c'est `canPublish` : rien de
 * plus n'est nécessaire, et surtout rien de moins.
 */
export async function setParticipantMuted(
  sessionId: string,
  targetUserId: string,
  hostUserId: string,
  muted: boolean,
) {
  const session = await assertIsHost(sessionId, hostUserId)
  if (targetUserId === hostUserId) throw new Error('CANNOT_MUTE_HOST')

  const updated = await db.liveParticipant.updateMany({
    where: { sessionId, userId: targetUserId },
    data: {
      mutedByHost: muted,
      // Donner la parole lève le verrou **et** baisse la main d'un même geste
      // (arbitrage 41) : laisser la main levée ferait figurer indéfiniment dans
      // la file quelqu'un qui a déjà obtenu ce qu'il demandait.
      ...(muted ? {} : { handRaisedAt: null }),
    },
  })
  if (updated.count === 0) throw new Error('PARTICIPANT_NOT_FOUND')

  await setParticipantCanPublish(session.roomName, targetUserId, !muted)

  await auditStandalone({
    actorId: hostUserId, actorRole: 'TRAINER',
    action: muted ? 'LIVE_PARTICIPANT_MUTED' : 'LIVE_PARTICIPANT_UNMUTED',
    targetType: 'LiveSession', targetId: sessionId,
    meta: { targetUserId },
  })

  return { muted }
}

/**
 * Retire une demande de la file sans rien accorder. Distinct de « donner la
 * parole » : l'animateur peut avoir traité la question autrement, et laisser la
 * main levée ferait figurer indéfiniment quelqu'un qui n'attend plus.
 */
export async function lowerParticipantHand(
  sessionId: string,
  targetUserId: string,
  hostUserId: string,
) {
  await assertIsHost(sessionId, hostUserId)
  const { count } = await db.liveParticipant.updateMany({
    where: { sessionId, userId: targetUserId },
    data: { handRaisedAt: null },
  })
  if (count === 0) throw new Error('PARTICIPANT_NOT_FOUND')
  return { lowered: true }
}

/** « Couper tout le monde » — l'animateur excepté, qui anime. */
export async function muteEveryone(sessionId: string, hostUserId: string) {
  const session = await assertIsHost(sessionId, hostUserId)

  const targets = await db.liveParticipant.findMany({
    where: { sessionId, leftAt: null, userId: { not: hostUserId }, mutedByHost: false },
    select: { userId: true },
  })

  await db.liveParticipant.updateMany({
    where: { sessionId, userId: { not: hostUserId } },
    data: { mutedByHost: true },
  })

  for (const target of targets) {
    await setParticipantCanPublish(session.roomName, target.userId, false)
  }

  await auditStandalone({
    actorId: hostUserId, actorRole: 'TRAINER',
    action: 'LIVE_MUTE_ALL', targetType: 'LiveSession', targetId: sessionId,
    meta: { count: targets.length },
  })

  return { muted: targets.length }
}

// --- Salon du live (arbitrage 42) ---

export async function postLiveMessage(sessionId: string, userId: string, body: string) {
  const text = body.trim()
  if (!text) throw new Error('BODY_REQUIRED')
  if (text.length > LIVE_MESSAGE_MAX_LENGTH) throw new Error('MESSAGE_TOO_LONG')

  const session = await db.liveSession.findUnique({
    where: { id: sessionId },
    select: { id: true, communityId: true, status: true },
  })
  if (!session) throw new Error('LIVE_SESSION_NOT_FOUND')
  if (session.status === 'CANCELED') throw new Error('LIVE_CANCELED')

  const viewer = await resolveViewer(session.communityId, userId)
  assertCanSpeak(viewer)

  return db.liveMessage.create({
    data: { sessionId, authorId: userId, body: text },
    select: { id: true },
  })
}

// --- Agendas ---

/**
 * Vues destinées aux écrans. Les noms suivent le vocabulaire que les composants
 * parlent déjà depuis le Lot 0 (`session.community.name`, `session.host.name`) :
 * renommer côté interface aurait touché neuf cents lignes de balisage pour ne
 * rien changer à ce qui s'affiche.
 */
export interface ViewCommunity {
  name: string
  slug: string
}

export interface ViewHost {
  name: string
  role: string
}

export interface AgendaSession {
  id: string
  title: string
  description: string | null
  status: LiveSessionStatus
  startsAt: Date
  durationMinutes: number
  community: ViewCommunity
  host: ViewHost
  attendees: number
  live: boolean
  /**
   * Le spectateur anime-t-il cette séance ?
   *
   * C'est ce drapeau qui a permis de fusionner l'agenda apprenant et l'écran
   * des sessions du formateur : l'origine d'une ligne se lit sur la ligne, elle
   * n'est plus déduite de la page qui l'affiche. Deux listes tirées de la même
   * requête ne pouvaient pas dire laquelle des deux vous regardiez.
   */
  mine: boolean
}

const AGENDA_SELECT = {
  id: true, title: true, description: true, status: true,
  scheduledStartAt: true, durationMinutes: true, peakParticipants: true, startedAt: true,
  community: {
    select: {
      name: true, slug: true,
      trainerProfile: { select: { slogan: true, user: { select: { fullName: true } } } },
    },
  },
  _count: { select: { participants: { where: { leftAt: null } } } },
} as const

function toAgenda(s: {
  id: string; title: string; description: string | null; status: LiveSessionStatus
  scheduledStartAt: Date; durationMinutes: number; peakParticipants: number
  community: {
    name: string; slug: string
    trainerProfile: { slogan: string | null; user: { fullName: string | null } }
  }
  _count: { participants: number }
}, mine: boolean): AgendaSession {
  return {
    mine,
    id: s.id,
    title: s.title,
    description: s.description,
    status: s.status,
    startsAt: s.scheduledStartAt,
    durationMinutes: s.durationMinutes,
    community: { name: s.community.name, slug: s.community.slug },
    host: {
      name: s.community.trainerProfile.user.fullName ?? 'Formateur NkamVa',
      role: s.community.trainerProfile.slogan ?? 'Formateur',
    },
    // Pendant la séance, le nombre de présents ; après, le pic atteint.
    attendees: s.status === 'LIVE' ? s._count.participants : s.peakParticipants,
    live: s.status === 'LIVE',
  }
}

/** Les séances des communautés que l'apprenant a rejointes. */
export async function listMyAgenda(userId: string): Promise<AgendaSession[]> {
  const subscriptions = await db.communitySubscription.findMany({
    where: { learnerId: userId, status: { in: [...OPEN_STATUSES] } },
    select: { communityId: true },
  })
  if (subscriptions.length === 0) return []

  const sessions = await db.liveSession.findMany({
    where: {
      communityId: { in: subscriptions.map((s) => s.communityId) },
      status: { in: ['SCHEDULED', 'LIVE'] },
    },
    orderBy: { scheduledStartAt: 'asc' },
    take: 50,
    select: AGENDA_SELECT,
  })
  return sessions.map((s) => toAgenda(s, false))
}

/** Les séances d'un formateur — passées comprises, c'est sa console. */
export async function listTrainerSessions(trainerProfileId: string): Promise<AgendaSession[]> {
  const sessions = await db.liveSession.findMany({
    where: { trainerId: trainerProfileId },
    orderBy: { scheduledStartAt: 'desc' },
    take: 60,
    select: AGENDA_SELECT,
  })
  return sessions.map((s) => toAgenda(s, true))
}

/**
 * L'agenda complet d'une personne : ce qu'elle anime **et** ce qu'elle suit,
 * dans une seule liste ordonnée par date.
 *
 * Les séances animées sont filtrées sur « à venir ou en cours » comme les
 * autres : une séance terminée appartient à ses replays, pas à un agenda. C'est
 * la règle que l'écran formateur appliquait déjà avant la fusion.
 *
 * `trainerProfileId` nul pour qui n'est pas formateur — l'appelant n'a alors
 * qu'une seule requête à payer.
 */
export async function listAgenda(
  userId: string,
  trainerProfileId: string | null,
): Promise<AgendaSession[]> {
  const [joined, hosted] = await Promise.all([
    listMyAgenda(userId),
    trainerProfileId ? listTrainerSessions(trainerProfileId) : Promise.resolve([]),
  ])

  // Un formateur abonné à sa propre communauté verrait sa séance deux fois.
  // L'entrée animée écrase la suivie : quand les deux sont vraies, c'est
  // « j'anime » qui décide de l'action proposée.
  const byId = new Map<string, AgendaSession>()
  for (const session of joined) byId.set(session.id, session)
  for (const session of hosted) {
    if (session.status === 'SCHEDULED' || session.status === 'LIVE') byId.set(session.id, session)
  }

  return [...byId.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
}

// --- Replays ---

export interface ReplayView {
  id: string
  sessionId: string
  title: string
  description: string | null
  recordedAt: Date
  durationSeconds: number
  status: string
  community: ViewCommunity
  host: ViewHost
  /** Arbitrage 55 — droit uniforme de tout membre, aucune case par séance. */
  downloadable: boolean
  purgeAt: Date
  /**
   * Le spectateur est-il le formateur de la communauté qui a produit ce replay ?
   *
   * `listMyReplays` réunit délibérément les communautés suivies et celles
   * animées. Sans ce drapeau, l'écran formateur intitulait « Replays produits »
   * une liste qui contenait aussi les replays des communautés où il n'est
   * qu'abonné, et la tuile « replays enregistrés » comptait faux.
   */
  mine: boolean
}

/**
 * Accès à un replay — la rencontre des arbitrages 34 et 44 :
 *
 *   membre actuel  → tout, sans filtre de date
 *   ancien membre  → ce dont **la date du live** tombe dans une de ses périodes
 *
 * L'ordre des deux branches n'est pas décoratif : un membre revenu récupère ce
 * qui a été ajouté pendant son absence (arbitrage 44), ce que la seconde branche
 * seule lui refuserait.
 */
export async function hasReplayAccess(
  userId: string,
  replay: { communityId: string; recordedAt: Date },
): Promise<boolean> {
  const community = await db.community.findUnique({
    where: { id: replay.communityId },
    select: { trainerProfile: { select: { userId: true } } },
  })
  if (community?.trainerProfile.userId === userId) return true

  const subscriptions = await db.communitySubscription.findMany({
    where: { communityId: replay.communityId, learnerId: userId },
    select: { status: true, periodStart: true, periodEnd: true },
  })
  if (subscriptions.length === 0) return false

  if (subscriptions.some((s) => OPEN_STATUSES.includes(s.status as never))) return true

  return subscriptions.some(
    (s) => s.periodStart <= replay.recordedAt && replay.recordedAt <= s.periodEnd,
  )
}

const REPLAY_SELECT = {
  id: true, sessionId: true, title: true, recordedAt: true, durationSeconds: true,
  status: true, purgeAt: true, communityId: true, s3Key: true,
  session: { select: { description: true } },
  community: {
    select: {
      name: true, slug: true,
      // `userId` sert à `getReplay` pour renseigner `mine` sans seconde requête.
      trainerProfile: { select: { userId: true, slogan: true, user: { select: { fullName: true } } } },
    },
  },
} as const

function toReplay(r: {
  id: string; sessionId: string; title: string; recordedAt: Date
  durationSeconds: number | null; status: string; purgeAt: Date
  session: { description: string | null }
  community: {
    name: string; slug: string
    trainerProfile: { userId: string; slogan: string | null; user: { fullName: string | null } }
  }
}, mine: boolean): ReplayView {
  return {
    mine,
    id: r.id,
    sessionId: r.sessionId,
    title: r.title,
    description: r.session.description,
    recordedAt: r.recordedAt,
    // Le lecteur divise par cette valeur : un zéro y produirait une barre de
    // progression à NaN. Une séance sans durée connue vaut une seconde.
    durationSeconds: r.durationSeconds ?? 1,
    status: r.status,
    community: { name: r.community.name, slug: r.community.slug },
    host: {
      name: r.community.trainerProfile.user.fullName ?? 'Formateur NkamVa',
      role: r.community.trainerProfile.slogan ?? 'Formateur',
    },
    // Arbitrage 43 requalifié par 55 : les deux cadences ayant des droits
    // identiques, aucune ne refuse le téléchargement. C'est donc un droit
    // uniforme, et il n'y a **pas** de case « téléchargeable » par séance.
    downloadable: r.status === 'READY',
    purgeAt: r.purgeAt,
  }
}

export async function listMyReplays(userId: string): Promise<ReplayView[]> {
  const subscriptions = await db.communitySubscription.findMany({
    where: { learnerId: userId },
    select: { communityId: true, status: true, periodStart: true, periodEnd: true },
  })
  const asTrainer = await db.community.findMany({
    where: { trainerProfile: { userId } },
    select: { id: true },
  })

  const communityIds = [
    ...new Set([...subscriptions.map((s) => s.communityId), ...asTrainer.map((c) => c.id)]),
  ]
  if (communityIds.length === 0) return []

  const replays = await db.replay.findMany({
    where: { communityId: { in: communityIds }, purgedAt: null },
    orderBy: { recordedAt: 'desc' },
    take: 100,
    select: REPLAY_SELECT,
  })

  const open = new Set(
    subscriptions.filter((s) => OPEN_STATUSES.includes(s.status as never)).map((s) => s.communityId),
  )
  const ownIds = new Set(asTrainer.map((c) => c.id))

  return replays
    .filter((r) => {
      if (ownIds.has(r.communityId) || open.has(r.communityId)) return true
      return subscriptions.some(
        (s) =>
          s.communityId === r.communityId &&
          s.periodStart <= r.recordedAt &&
          r.recordedAt <= s.periodEnd,
      )
    })
    .map((r) => toReplay(r, ownIds.has(r.communityId)))
}

export async function getReplay(replayId: string, userId: string): Promise<ReplayView> {
  const replay = await db.replay.findFirst({
    where: { id: replayId, purgedAt: null },
    select: REPLAY_SELECT,
  })
  if (!replay) throw new Error('REPLAY_NOT_FOUND')
  if (!(await hasReplayAccess(userId, replay))) throw new Error('NOT_MEMBER')
  return toReplay(replay, replay.community.trainerProfile.userId === userId)
}

/** URL signée de lecture ou de téléchargement. Droit uniforme (arbitrage 55). */
export async function getReplayUrl(
  replayId: string,
  userId: string,
  forDownload = false,
): Promise<string> {
  const replay = await db.replay.findFirst({
    where: { id: replayId, purgedAt: null },
    select: {
      id: true, communityId: true, recordedAt: true, s3Key: true, status: true,
      muxPlaybackId: true,
    },
  })
  if (!replay) throw new Error('REPLAY_NOT_FOUND')
  if (!(await hasReplayAccess(userId, replay))) throw new Error('NOT_MEMBER')
  if (replay.status !== 'READY') throw new Error('REPLAY_UNAVAILABLE')

  // Hébergé par Mux : lecture HLS adaptative, sans URL signée à renouveler.
  if (replay.muxPlaybackId) {
    return forDownload ? downloadUrl(replay.muxPlaybackId) : playbackUrl(replay.muxPlaybackId)
  }
  // Sinon, la clé enregistrée au démarrage de l'egress — jamais reconstruite.
  if (!replay.s3Key) throw new Error('REPLAY_UNAVAILABLE')
  return presignDownload(replay.s3Key)
}

// --- Cycle de vie des replays (jobs) ---

/**
 * Purge les replays au terme des 24 mois (arbitrage 51). L'espace revient au
 * formateur — c'est la raison pour laquelle il est prévenu à l'approche, et pas
 * seulement informé après coup.
 *
 * La ligne n'est pas supprimée : un membre qui cherche pourquoi un replay a
 * disparu doit trouver une réponse, pas un vide.
 */
export async function purgeExpiredReplays(now = new Date()): Promise<{ purged: number }> {
  const expired = await db.replay.findMany({
    where: { purgedAt: null, purgeAt: { lte: now } },
    select: { id: true, title: true, sizeBytes: true, trainerId: true },
  })

  for (const replay of expired) {
    await db.replay.update({
      where: { id: replay.id },
      data: { purgedAt: now, status: 'PURGED', s3Key: null, sizeBytes: null },
    })
    await auditStandalone({
      actorId: null, actorRole: 'SYSTEM',
      action: 'REPLAY_PURGED', targetType: 'Replay', targetId: replay.id,
      meta: { retentionMonths: REPLAY_RETENTION_MONTHS, freedBytes: Number(replay.sizeBytes ?? 0) },
    })
  }

  return { purged: expired.length }
}

/**
 * Prévient le formateur des replays qui seront purgés sous 30 jours. Il a un
 * intérêt direct à le savoir : la purge lui rend du quota (arbitrage 54), et
 * c'est sa dernière fenêtre pour en récupérer une copie.
 */
export async function alertUpcomingReplayPurges(now = new Date()): Promise<{ alerted: number }> {
  const horizon = new Date(now.getTime() + 30 * 86_400_000)

  const soon = await db.replay.findMany({
    where: { purgedAt: null, purgeAt: { gt: now, lte: horizon } },
    select: {
      id: true, title: true, purgeAt: true,
      trainerProfile: { select: { userId: true } },
    },
  })

  for (const replay of soon) {
    await deliverSideEffects('REPLAY_PURGE_SOON', { type: 'Replay', id: replay.id }, () =>
      notify(replay.trainerProfile.userId, {
        type: 'REPLAY_PURGE_SOON',
        title: `« ${replay.title} » sera supprimé le ${replay.purgeAt.toLocaleDateString('fr-FR', { dateStyle: 'long' })}`,
        body: `Les replays sont conservés ${REPLAY_RETENTION_MONTHS} mois. La suppression vous rendra l'espace de stockage correspondant.`,
        link: '/mes-lives',
      }),
    )
  }

  return { alerted: soon.length }
}

/**
 * Constate la fin d'encodage d'un enregistrement. Appelée par le webhook egress
 * quand il existe ; sinon utilisable à la main. La taille est **enregistrée**,
 * jamais devinée : c'est elle qui alimente le quota du formateur.
 */
export async function markReplayReady(
  sessionId: string,
  input: {
    s3Key?: string
    sizeBytes?: number
    durationSeconds?: number
    muxAssetId?: string
    muxPlaybackId?: string
  },
): Promise<void> {
  await db.replay.update({
    where: { sessionId },
    data: {
      status: 'READY',
      ...(input.s3Key ? { s3Key: input.s3Key } : {}),
      // Chez Mux, l'octet n'est pas chez nous : `sizeBytes` reste nul et le
      // replay ne pèse pas sur le quota du formateur (arbitrage 54).
      ...(input.sizeBytes !== undefined ? { sizeBytes: BigInt(input.sizeBytes) } : {}),
      ...(input.durationSeconds ? { durationSeconds: Math.round(input.durationSeconds) } : {}),
      ...(input.muxAssetId ? { muxAssetId: input.muxAssetId } : {}),
      ...(input.muxPlaybackId ? { muxPlaybackId: input.muxPlaybackId } : {}),
    },
  })
  await auditStandalone({
    actorId: null, actorRole: 'SYSTEM',
    action: 'REPLAY_READY', targetType: 'Replay', targetId: sessionId,
    meta: {
      sizeBytes: input.sizeBytes ?? 0,
      host: input.muxPlaybackId ? 'MUX' : 'STORAGE',
    },
  })
}

/** Marque l'enregistrement en échec : Mux a renvoyé une erreur sur l'asset. */
export async function markReplayFailed(sessionId: string, reason: string): Promise<void> {
  await db.replay.updateMany({ where: { sessionId }, data: { status: 'FAILED' } })
  await auditStandalone({
    actorId: null, actorRole: 'SYSTEM',
    action: 'REPLAY_FAILED', targetType: 'Replay', targetId: sessionId,
    meta: { reason },
  })
}

/**
 * Fait aboutir les replays que l'egress fichier a laissés en `PROCESSING`.
 *
 * L'enregistrement composé vers Mux se referme par webhook (`video.asset.ready`,
 * voir `/api/webhooks/mux`) : quand Mux est configuré, `PROCESSING` se résout
 * tout seul. L'egress fichier vers R2 — le repli utilisé sans Mux — n'a **aucun
 * webhook** : `stopRecording` demande l'arrêt sans jamais attendre que le
 * fichier soit écrit. Sans ce job, un replay parti par ce chemin restait
 * `PROCESSING` indéfiniment, une promesse que l'arbitrage 38 ne tenait qu'à
 * moitié — et `sizeBytes` n'était jamais renseigné, ce qui faussait
 * silencieusement le quota de stockage du formateur (arbitrage 54).
 *
 * On ne retente que les sessions qui ont un `egressId` mais pas de
 * `muxStreamId` : celles qui attendent le webhook Mux ont déjà leur chemin de
 * résolution, les interroger ici les ferait consulter deux fois.
 */
export async function reconcileProcessingReplays(): Promise<{
  resolved: number
  failed: number
  stillProcessing: number
}> {
  const pending = await db.replay.findMany({
    where: { status: 'PROCESSING', session: { egressId: { not: null }, muxStreamId: null } },
    select: { id: true, sessionId: true, session: { select: { egressId: true } } },
  })

  let resolved = 0
  let failed = 0
  let stillProcessing = 0

  for (const replay of pending) {
    const egressId = replay.session.egressId
    if (!egressId) continue

    const outcome = await getEgressOutcome(egressId)
    if (!outcome.done) {
      stillProcessing++
      continue
    }

    if (outcome.ok) {
      await markReplayReady(replay.sessionId, {
        s3Key: outcome.s3Key,
        sizeBytes: outcome.sizeBytes,
        durationSeconds: outcome.durationSeconds,
      })
      resolved++
    } else {
      await markReplayFailed(replay.sessionId, outcome.reason)
      failed++
    }
  }

  return { resolved, failed, stillProcessing }
}

// --- Diffusion ---

async function notifyMembers(
  communityId: string,
  exceptUserId: string,
  params: { type: string; title: string; body: string; link: string },
): Promise<void> {
  const members = await db.communitySubscription.findMany({
    where: { communityId, status: { in: ['ACTIVE', 'PAST_DUE'] }, learnerId: { not: exceptUserId } },
    select: { learnerId: true },
  })
  for (const member of members) await notify(member.learnerId, params)
}

/** Utilisé par la console formateur pour afficher la présence réelle. */
export async function connectedCount(sessionId: string): Promise<number> {
  const session = await db.liveSession.findUnique({
    where: { id: sessionId },
    select: { roomName: true, status: true },
  })
  if (!session || session.status !== 'LIVE') return 0
  return countConnected(session.roomName)
}
