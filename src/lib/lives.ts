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
import { addMonthsUtc } from './months'
import { audit, auditStandalone } from './audit'
import { notify, deliverSideEffects } from './notification'
import { presignDownload, deleteObject } from './s3'
import { DOWNLOAD_NOTICE_DAYS, sendNoticeOnce } from './notices'
import {
  isLiveKitConfigured, livekitUrl, mintJoinToken, ensureRoom, closeRoom,
  setParticipantCanPublish, countConnected, startRecording, startAudioRecording,
  startStreamRecording, stopRecording, getEgressOutcome,
} from './livekit'
import {
  isMuxConfigured, createLiveStream, disableLiveStream, playbackUrl, downloadUrl,
} from './mux'
import { userAvatarSrc } from './avatars'
import { LIVE_NEVER_STARTED_CLOSE_HOURS, LIVE_SCHEDULE_HORIZON_DAYS, LIVE_SCHEDULE_PAST_TOLERANCE_MINUTES } from './rules'

/** Voir `memberships.ts` — les listes de statuts ouverts restent alignées. */
const OPEN_STATUSES = ['ACTIVE', 'PAST_DUE', 'BANNED'] as const

/** Arbitrage 51 — un replay vit 24 mois, puis rend son espace au formateur. */
export const REPLAY_RETENTION_MONTHS = 24

export const LIVE_MESSAGE_MAX_LENGTH = 2000

/**
 * Arbitrage 93 — neuf publieurs simultanés, animateur compris.
 *
 * Ce n'est pas une jauge de places : personne n'est refusé à l'entrée
 * (arbitrage 46), la salle accueille toute la communauté. C'est le nombre de
 * gens qui **émettent** en même temps, et il est plafonné pour une raison
 * mesurée : la bande descendante croît avec le carré du nombre de participants
 * quand chacun reçoit tous les autres. À trente personnes, deux heures de
 * séance coûtent plus de la moitié d'un abonnement communautaire mensuel — par
 * membre. Plafonnée, la facture redevient linéaire.
 *
 * Le plafond est global et ne se règle pas par séance : l'exposer serait
 * rouvrir la jauge que l'arbitrage 46 a refusée.
 */
export const LIVE_STAGE_CAPACITY = 9

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

/**
 * Un identifiant IANA que la plateforme d'exécution connaît. `Intl` est le seul
 * juge disponible : il n'y a pas de liste à maintenir, et une liste maintenue à
 * la main vieillirait plus vite que la base de fuseaux.
 */
function isValidTimeZone(zone: string | null | undefined): boolean {
  if (!zone) return false
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

export async function scheduleLiveSession(
  communityId: string,
  trainerProfileId: string,
  userId: string,
  input: {
    title: string
    description?: string | null
    scheduledStartAt: Date
    durationMinutes?: number
    /** Fuseau IANA dans lequel l'animateur a saisi l'heure (arbitrage 107). */
    timeZone?: string | null
  },
): Promise<{ id: string }> {
  const title = input.title.trim()
  if (!title) throw new Error('TITLE_REQUIRED')

  // La campagne du 12 octobre 2026 a programmé des séances dans le passé, en
  // l'an 9999, et deux qui se chevauchaient pour le même animateur (m12).
  const start = input.scheduledStartAt.getTime()
  const now = Date.now()
  if (Number.isNaN(start) || start < now - LIVE_SCHEDULE_PAST_TOLERANCE_MINUTES * 60_000) {
    throw new Error('LIVE_START_IN_PAST')
  }
  if (start > now + LIVE_SCHEDULE_HORIZON_DAYS * 86_400_000) throw new Error('LIVE_START_TOO_FAR')

  const durationMinutes = input.durationMinutes ?? 60
  const end = start + durationMinutes * 60_000
  // Une séance dure au plus huit heures (schéma de la route) : celles qui
  // pourraient chevaucher commencent moins de huit heures avant celle-ci.
  const neighbours = await db.liveSession.findMany({
    where: {
      trainerId: trainerProfileId,
      status: { in: ['SCHEDULED', 'LIVE'] },
      scheduledStartAt: { gte: new Date(start - 8 * 3_600_000), lt: new Date(end) },
    },
    select: { scheduledStartAt: true, durationMinutes: true },
  })
  const overlaps = neighbours.some((s) => s.scheduledStartAt.getTime() + s.durationMinutes * 60_000 > start)
  if (overlaps) throw new Error('LIVE_OVERLAP')

  // Un fuseau invalide est **ignoré**, pas refusé : il ne décide de rien —
  // l'heure est en UTC — et faire échouer la programmation d'une séance parce
  // qu'un navigateur exotique annonce un identifiant inconnu serait perdre le
  // vrai pour le décoratif.
  const timeZone = isValidTimeZone(input.timeZone) ? input.timeZone! : null

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
        timeZone,
        durationMinutes,
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
      body: `${title}, le ${input.scheduledStartAt.toLocaleDateString('fr-FR', { dateStyle: 'long' })}.`,
      link: '/mes-lives',
    }),
  )

  return session
}

/**
 * Ferme les séances jamais lancées, une fois leur fin prévue dépassée de
 * `LIVE_NEVER_STARTED_CLOSE_HOURS`. Deux séances de septembre étaient encore
 * « programmées » en mars, dans l'agenda des membres comme dans celui de
 * l'animateur (campagne du 12 octobre 2026, m12).
 *
 * Silencieuse : personne n'est prévenu d'une séance qui n'a pas eu lieu, ce
 * serait annoncer après coup ce que chacun a constaté. La trace reste au
 * journal.
 */
export async function closeNeverStartedSessions(now = new Date()): Promise<{ closed: number }> {
  const stale = await db.liveSession.findMany({
    where: { status: 'SCHEDULED', scheduledStartAt: { lt: now } },
    select: { id: true, scheduledStartAt: true, durationMinutes: true },
  })
  const graceMs = LIVE_NEVER_STARTED_CLOSE_HOURS * 3_600_000
  const ids = stale
    .filter((s) => s.scheduledStartAt.getTime() + s.durationMinutes * 60_000 + graceMs < now.getTime())
    .map((s) => s.id)
  if (ids.length === 0) return { closed: 0 }

  const { count } = await db.liveSession.updateMany({
    where: { id: { in: ids }, status: 'SCHEDULED' },
    data: { status: 'CANCELED' },
  })
  await auditStandalone({
    actorId: null, actorRole: 'SYSTEM',
    action: 'LIVE_SESSION_NEVER_STARTED', meta: { sessionIds: ids, closed: count },
  })
  return { closed: count }
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

// --- Où va l'enregistrement (arbitrage 94) ---

/**
 * Mux n'enregistre que si on le lui demande explicitement.
 *
 * Avant l'arbitrage 94, la seule présence de clés dans l'environnement suffisait
 * à lui confier tous les replays — et donc à choisir, sans que personne l'ait
 * décidé, un coût treize fois supérieur sur vingt-quatre mois. Il reste
 * appelable parce que son encodage adaptatif n'a pas d'équivalent dans le seau ;
 * il ne redevient le chemin par défaut d'aucune configuration.
 */
function usesMux(): boolean {
  return process.env.REPLAY_RECORDER === 'MUX' && isMuxConfigured()
}

/**
 * Les deux clés d'un replay. Écrites une seule fois, au démarrage de l'egress,
 * et **jamais reconstruites** ailleurs : c'est la leçon de
 * `getCourseContentUrl`, qui devinait la clé d'une ressource et se trompait dès
 * que la convention changeait.
 */
const replayVideoKey = (sessionId: string) => `replays/${sessionId}/enregistrement.mp4`
const replayAudioKey = (sessionId: string) => `replays/${sessionId}/enregistrement.ogg`

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

  // Arbitrage 94 — l'enregistrement va dans le seau, et Mux se demande.
  // L'inverse était le cas avant : Mux enregistrait dès qu'il était configuré,
  // et la seule présence de clés dans l'environnement décidait d'un coût
  // treize fois supérieur sur vingt-quatre mois.
  const stream = usesMux() ? await createLiveStream() : null
  const [egressId, audioEgressId] = stream
    ? [await startStreamRecording(session.roomName, stream.rtmpUrl), null]
    : await Promise.all([
        startRecording(session.roomName, replayVideoKey(sessionId)),
        startAudioRecording(session.roomName, replayAudioKey(sessionId)),
      ])

  await db.$transaction(async (tx) => {
    await tx.liveSession.update({
      where: { id: sessionId },
      data: {
        status: 'LIVE', startedAt, egressId, audioEgressId,
        muxStreamId: stream?.streamId ?? null,
      },
    })
    await audit(tx, {
      actorId: userId, actorRole: 'TRAINER',
      action: 'LIVE_SESSION_STARTED', targetType: 'LiveSession', targetId: sessionId,
      meta: {
        communityId: session.communityId,
        recording: Boolean(egressId),
        recorder: stream ? 'MUX' : egressId ? 'STORAGE' : null,
        audioVariant: Boolean(audioEgressId),
      },
    })
  })

  return { id: sessionId, alreadyLive: false }
}

/**
 * Cœur de clôture, partagé par la fin manuelle (l'animateur clique « terminer »)
 * et la fin **système** (le webhook LiveKit `room_finished`, quand la salle s'est
 * vidée sans que personne ne clôture). Le replay est créé même quand
 * l'enregistrement a échoué — en `FAILED` : l'arbitrage 38 promet qu'un replay
 * existe systématiquement, et une promesse tenue à moitié se constate mieux
 * qu'elle ne se devine.
 *
 * **Idempotent et insensible aux courses.** La transition `LIVE → ENDED` est une
 * `updateMany` gardée sur `status: 'LIVE'` à l'intérieur de la transaction :
 * seule celle qui bascule réellement crée le replay. Un second appel — le clic
 * de l'animateur ET le `room_finished`, ou deux webhooks rejoués — voit `count`
 * à zéro, ne crée aucun replay (pas de collision sur l'unicité de `sessionId`)
 * et ne notifie pas deux fois.
 */
async function finalizeLiveSession(
  sessionId: string,
  actor: { id: string | null; role: 'TRAINER' | 'SYSTEM' },
): Promise<{ ended: boolean; recorded: boolean }> {
  const full = await db.liveSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true, status: true, communityId: true, trainerId: true, title: true,
      startedAt: true, egressId: true, audioEgressId: true, roomName: true, muxStreamId: true,
      community: { select: { name: true, slug: true } },
    },
  })
  if (!full || full.status !== 'LIVE') return { ended: false, recorded: false }

  if (full.egressId) await stopRecording(full.egressId)
  if (full.audioEgressId) await stopRecording(full.audioEgressId)
  // Le flux d'ingestion se ferme ; l'asset déjà produit, lui, survit et
  // arrivera par webhook.
  if (full.muxStreamId) await disableLiveStream(full.muxStreamId)
  await closeRoom(full.roomName)

  const endedAt = new Date()
  // Arbitrage 34 — c'est la date du live qui fait foi. On date le replay du
  // **début** de la séance, pas de la fin de son encodage.
  const recordedAt = full.startedAt ?? endedAt
  // En UTC et sans débordement (m18).
  const purgeAt = addMonthsUtc(recordedAt, REPLAY_RETENTION_MONTHS)

  const outcome = await db.$transaction(async (tx) => {
    // Garde de course : seule la transaction qui fait réellement passer la
    // session de LIVE à ENDED a le droit de créer le replay.
    const transition = await tx.liveSession.updateMany({
      where: { id: sessionId, status: 'LIVE' },
      data: { status: 'ENDED', endedAt },
    })
    if (transition.count === 0) return { ended: false }

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
        s3Key: full.egressId && !full.muxStreamId ? replayVideoKey(sessionId) : null,
        audioS3Key: full.audioEgressId ? replayAudioKey(sessionId) : null,
        status: full.egressId ? 'PROCESSING' : 'FAILED',
        purgeAt,
      },
    })
    await audit(tx, {
      actorId: actor.id, actorRole: actor.role,
      action: 'LIVE_SESSION_ENDED', targetType: 'LiveSession', targetId: sessionId,
      meta: { communityId: full.communityId, recorded: Boolean(full.egressId), by: actor.role },
    })
    return { ended: true }
  })

  if (!outcome.ended) return { ended: false, recorded: false }

  await deliverSideEffects('LIVE_ENDED', { type: 'LiveSession', id: sessionId }, () =>
    // `actor.id ?? ''` : la fin système n'a pas d'acteur à exclure, et l'animateur
    // n'est de toute façon pas membre de sa propre communauté.
    notifyMembers(full.communityId, actor.id ?? '', {
      type: 'REPLAY_AVAILABLE',
      title: `Le replay de « ${full.title} » arrive`,
      body: 'La séance est terminée. Son enregistrement sera disponible dans quelques minutes.',
      // L'enregistrement n'existe pas encore : on mène à l'onglet, pas à une
      // page qui répondrait 404 pendant les minutes d'encodage.
      link: '/mes-lives?onglet=replays',
    }),
  )

  return { ended: true, recorded: Boolean(full.egressId) }
}

/**
 * Clôt la séance à la demande de l'animateur. Lui seul passe par ici : la garde
 * d'hôte et l'erreur explicite `LIVE_NOT_STARTED` servent son écran.
 */
export async function endLiveSession(sessionId: string, userId: string) {
  const session = await assertIsHost(sessionId, userId)
  if (session.status !== 'LIVE') throw new Error('LIVE_NOT_STARTED')
  return finalizeLiveSession(sessionId, { id: userId, role: 'TRAINER' })
}

/**
 * Clôt une séance restée `LIVE` alors que sa salle LiveKit s'est fermée — le cas
 * d'un animateur qui ferme l'onglet, perd la connexion, ou oublie de terminer.
 * Déclenché par le webhook `room_finished` : sans lui, la session restait `LIVE`
 * pour toujours et **aucun replay n'était jamais créé**. Aucune garde d'hôte —
 * l'appelant est le serveur, authentifié par la signature du webhook — et aucun
 * jet : une salle sans session, ou une session déjà close, n'est pas une erreur.
 */
export async function endLiveSessionBySystem(sessionId: string): Promise<{ ended: boolean }> {
  const { ended } = await finalizeLiveSession(sessionId, { id: null, role: 'SYSTEM' })
  return { ended }
}

// --- Participer ---

// --- La scène (arbitrage 93) ---

/**
 * Prend une place sur la scène si le plafond le permet. Rend `true` quand la
 * place est acquise — ou qu'elle l'était déjà.
 *
 * Le verrou sur la ligne de séance sérialise l'attribution. Sans lui, deux
 * entrées simultanées comptent chacune huit places prises et en accordent une
 * neuvième **et** une dixième : le plafond ne tiendrait qu'en l'absence de
 * concurrence, c'est-à-dire jamais pendant une séance qui commence. C'est le
 * seul verrou pessimiste du dépôt, et il l'est pour une raison précise : le
 * contrôle optimiste par `expectedUpdatedAt` compare un état connu, or ici il
 * n'y a rien à comparer — seulement à compter.
 *
 * L'animateur ne passe pas par ici : sa place est acquise (voir `takeHostSeat`).
 */
async function claimStageSeat(
  sessionId: string,
  userId: string,
): Promise<'SEATED' | 'FULL' | 'MISSING'> {
  return db.$transaction(async (tx) => {
    // Pas de `::uuid` : les identifiants du dépôt sont des `String @id`, donc
    // des colonnes TEXT. Le cast faisait échouer la requête en 42883.
    await tx.$queryRaw`SELECT id FROM live_sessions WHERE id = ${sessionId} FOR UPDATE`

    const current = await tx.liveParticipant.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
      select: { onStage: true },
    })
    // Trois issues et non deux : « la scène est pleine » et « cette personne
    // n'est pas dans la séance » ne se disent pas de la même façon à
    // l'animateur, et les confondre lui ferait chercher une place à libérer
    // pour quelqu'un qui est parti.
    if (!current) return 'MISSING'
    if (current.onStage) return 'SEATED'

    const taken = await tx.liveParticipant.count({
      where: { sessionId, onStage: true, leftAt: null },
    })
    if (taken >= LIVE_STAGE_CAPACITY) return 'FULL'

    await tx.liveParticipant.update({
      where: { sessionId_userId: { sessionId, userId } },
      data: { onStage: true },
    })
    return 'SEATED'
  })
}

/**
 * La place de l'animateur, qui ne se refuse pas : il anime, il publie.
 *
 * Elle est **comptée** comme les autres — sans quoi le plafond de neuf
 * deviendrait dix. Le seul cas où elle le dépasse est un animateur qui
 * rejoindrait une séance dont neuf membres tiennent déjà la scène ; il ne peut
 * pas se produire en pratique, puisque c'est lui qui ouvre la séance.
 */
async function takeHostSeat(sessionId: string, userId: string): Promise<void> {
  await db.liveParticipant.updateMany({
    where: { sessionId, userId, onStage: false },
    data: { onStage: true },
  })
}

async function releaseStageSeat(sessionId: string, userId: string): Promise<void> {
  await db.liveParticipant.updateMany({
    where: { sessionId, userId, onStage: true },
    data: { onStage: false },
  })
}

export interface StageState {
  capacity: number
  taken: number
  full: boolean
}

/**
 * L'occupation de la scène telle que l'écran doit l'annoncer.
 *
 * Le compte est fait sur la liste déjà chargée plutôt que par une requête de
 * plus : la lecture qui suit l'attribution doit refléter la place qu'on vient
 * de prendre, or la liste a pu être lue avant. D'où `viewerOnStage`, qui
 * corrige la ligne du lecteur.
 */
function stageStateOf(
  participants: Array<{ userId: string; onStage: boolean }>,
  viewerId: string,
  viewerOnStage: boolean,
): StageState {
  const taken = participants.filter((p) =>
    p.userId === viewerId ? viewerOnStage : p.onStage,
  ).length
  return { capacity: LIVE_STAGE_CAPACITY, taken, full: taken >= LIVE_STAGE_CAPACITY }
}

export interface LiveRoomView {
  id: string
  /** Qui regarde — l'écran s'en sert pour se reconnaître dans la liste. */
  viewerId: string
  title: string
  description: string | null
  status: LiveSessionStatus
  startsAt: Date
  /**
   * Fuseau de l'animateur (arbitrage 107) — nul si la séance a été programmée
   * avant. La salle écrit la date de la séance : son premier rendu la place
   * dans ce fuseau, comme la ligne d'agenda (`hooks/use-reader-time-zone.ts`).
   */
  timeZone: string | null
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
  /**
   * Ce participant tient-il une des neuf places (arbitrage 93) ? Ne pas le
   * confondre avec `mutedByHost` : sans place, personne ne l'a coupé.
   */
  onStage: boolean
  /** Occupation de la scène, pour dire pourquoi le micro n'est pas disponible. */
  stage: StageState
  handRaisedAt: Date | null
  /** Rang dans la file des demandes de parole (arbitrage 36), 1 = premier. */
  handPosition: number | null
  /**
   * Arbitrage 144 — ce participant a-t-il le droit de montrer son écran ?
   * Toujours vrai pour l'animateur.
   */
  screenAllowed: boolean
  /** Sa demande de partage en attente, s'il en a une. */
  screenRequestedAt: Date | null
  /**
   * Personnes réellement connectées en ce moment, mesurées chez LiveKit. Pour
   * l'animateur seulement, pendant le direct ; `null` sinon, ou si LiveKit ne
   * répond pas. `participants` liste qui est entré et n'est pas reparti selon
   * la base — un départ n'y est noté que si le webhook LiveKit le signale.
   */
  connectedNow: number | null
  participants: Array<{
    userId: string
    name: string | null
    /** Photo de profil, quand elle existe — sinon l'écran retombe sur les initiales. */
    avatarUrl: string | null
    isHost: boolean
    mutedByHost: boolean
    onStage: boolean
    handRaisedAt: Date | null
    handPosition: number | null
    screenAllowed: boolean
    screenRequestedAt: Date | null
  }>
  messages: Array<{
    id: string
    authorId: string
    authorName: string | null
    authorAvatarUrl: string | null
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
      scheduledStartAt: true, timeZone: true, durationMinutes: true, startedAt: true, roomName: true,
      community: {
        select: {
          name: true, slug: true,
          trainerProfile: {
            select: {
              userId: true, slogan: true,
              user: { select: { id: true, fullName: true, avatarS3Key: true, avatarUrl: true } },
            },
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
    select: {
      mutedByHost: true, handRaisedAt: true, onStage: true,
      screenRequestedAt: true, screenAllowedAt: true,
    },
  })

  // Arbitrage 93 — une place se prend en entrant, dans la limite du plafond.
  // Rien avant que la séance soit ouverte : personne ne publie dans une salle
  // d'attente, et réserver une place à l'avance ferait de l'heure d'arrivée un
  // droit de parole.
  let onStage = participant.onStage
  if (session.status === 'LIVE') {
    if (viewer.isTrainer) {
      await takeHostSeat(sessionId, userId)
      onStage = true
    } else if (!participant.mutedByHost && muted === null) {
      onStage = (await claimStageSeat(sessionId, userId)) === 'SEATED'
    } else if (participant.onStage) {
      // Coupé ou restreint entre deux entrées : la place ne lui sert plus, et
      // la garder priverait quelqu'un d'autre.
      await releaseStageSeat(sessionId, userId)
      onStage = false
    }
  }

  const [participants, messages] = await Promise.all([
    db.liveParticipant.findMany({
      where: { sessionId, leftAt: null },
      orderBy: { joinedAt: 'asc' },
      select: {
        userId: true, mutedByHost: true, handRaisedAt: true, onStage: true,
        screenRequestedAt: true, screenAllowedAt: true,
        user: { select: { id: true, fullName: true, avatarS3Key: true, avatarUrl: true } },
      },
    }),
    db.liveMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: {
        id: true, authorId: true, body: true, createdAt: true, deletedAt: true,
        author: { select: { id: true, fullName: true, avatarS3Key: true, avatarUrl: true } },
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
  // bannissement, ni restriction de compte, **et** à condition de tenir une des
  // neuf places (arbitrage 93). L'animateur, lui, publie toujours.
  const canPublish = viewer.isTrainer || (onStage && !participant.mutedByHost && muted === null)
  // Arbitrage 144 — l'animateur montre son écran de plein droit ; un
  // participant, seulement si l'animateur le lui a accordé. Le droit voyage
  // dans le jeton, jamais dans l'écran.
  const canShareScreen = viewer.isTrainer || participant.screenAllowedAt !== null
  const token = session.status === 'LIVE'
    ? await mintJoinToken({
        roomName: session.roomName,
        identity: userId,
        name: viewer.isTrainer
          ? session.community.trainerProfile.user.fullName ?? 'Animateur'
          : participants.find((p) => p.userId === userId)?.user.fullName ?? 'Participant',
        canPublish,
        canShareScreen,
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
    timeZone: session.timeZone,
    durationMinutes: session.durationMinutes,
    startedAt: session.startedAt,
    attendees: participants.length,
    community: { name: session.community.name, slug: session.community.slug },
    host: {
      name: session.community.trainerProfile.user.fullName ?? 'Formateur NKAMVA',
      role: session.community.trainerProfile.slogan ?? 'Formateur',
      avatarUrl: userAvatarSrc(session.community.trainerProfile.user),
    },
    live: session.status === 'LIVE',
    connectedNow:
      viewer.isTrainer && session.status === 'LIVE' ? await countConnected(session.roomName) : null,
    isHost: viewer.isTrainer,
    canSpeak: muted === null,
    mutedReason: muted,
    mutedByHost: participant.mutedByHost,
    onStage,
    stage: stageStateOf(participants, userId, onStage),
    handRaisedAt: participant.handRaisedAt,
    handPosition: positionOf(userId),
    screenAllowed: canShareScreen,
    screenRequestedAt: participant.screenRequestedAt,
    participants: participants.map((p) => ({
      userId: p.userId,
      name: p.user.fullName,
      avatarUrl: userAvatarSrc(p.user),
      isHost: p.userId === hostUserId,
      mutedByHost: p.mutedByHost,
      onStage: p.userId === userId ? onStage : p.onStage,
      handRaisedAt: p.handRaisedAt,
      handPosition: positionOf(p.userId),
      // L'animateur n'a pas de ligne d'autorisation en base : son droit tient à
      // ce qu'il anime, et la console ne doit pas lui proposer de se l'accorder.
      screenAllowed: p.userId === hostUserId || p.screenAllowedAt !== null,
      screenRequestedAt: p.screenRequestedAt,
    })),
    // Un message retiré garde sa place et son auteur, jamais son texte.
    messages: messages.map((m) => ({
      id: m.id,
      authorId: m.authorId,
      authorName: m.author.fullName,
      authorAvatarUrl: userAvatarSrc(m.author),
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
    // Quitter la salle rend la place (arbitrage 93). Sans cela, une séance
    // finirait par n'avoir plus une seule place libre pour des gens partis
    // depuis une heure — et la file des mains levées ne s'écoulerait plus.
    // La demande de partage part avec la main levée, et pour la même raison :
    // une file où figurent des gens partis ne s'écoule plus. L'autorisation
    // déjà accordée, elle, reste — revenir après une coupure ne fait pas
    // redemander (arbitrage 144).
    data: { leftAt: new Date(), handRaisedAt: null, screenRequestedAt: null, onStage: false },
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

// --- Demander à montrer son écran (arbitrage 144) ---

/**
 * Demande — ou retire — l'autorisation de partager son écran.
 *
 * Le pendant exact de la main levée, et pour la même raison : le participant ne
 * s'accorde rien, il se signale. Ce qui change, c'est ce qui est demandé —
 * montrer, et non parler — parce que l'animateur n'arbitre pas les deux de la
 * même façon : donner la parole coûte une des neuf places (arbitrage 93),
 * accepter un écran coûte la scène entière le temps qu'il dure.
 *
 * Demander quand on est déjà autorisé ne fait rien : il n'y a rien à obtenir.
 */
export async function requestScreenShare(sessionId: string, userId: string, wanted: boolean) {
  const session = await db.liveSession.findUnique({
    where: { id: sessionId },
    select: { id: true, communityId: true, status: true },
  })
  if (!session) throw new Error('LIVE_SESSION_NOT_FOUND')
  if (session.status !== 'LIVE') throw new Error('LIVE_NOT_STARTED')

  const viewer = await resolveViewer(session.communityId, userId)
  // Un compte restreint ou banni assiste sans intervenir (arbitrage 40) :
  // montrer son écran est une intervention.
  assertCanSpeak(viewer)

  const participant = await db.liveParticipant.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
    select: { screenAllowedAt: true },
  })
  if (!participant) throw new Error('PARTICIPANT_NOT_FOUND')
  if (wanted && participant.screenAllowedAt !== null) return { requested: false, allowed: true }

  await db.liveParticipant.update({
    where: { sessionId_userId: { sessionId, userId } },
    data: { screenRequestedAt: wanted ? new Date() : null },
  })

  return { requested: wanted, allowed: participant.screenAllowedAt !== null }
}

/**
 * L'animateur accorde ou retire le partage d'écran.
 *
 * Accorder **efface la demande** du même geste, comme donner la parole baisse la
 * main (arbitrage 41) : laisser la demande dans la file ferait attendre
 * quelqu'un qui a déjà obtenu ce qu'il voulait.
 *
 * Retirer ne coupe pas le micro et ne touche à aucune place : les deux droits
 * sont indépendants (voir `publishableSources`). Le partage en cours, lui,
 * s'arrête — LiveKit révoque la source, et le navigateur rend la piste.
 */
export async function setParticipantScreen(
  sessionId: string,
  targetUserId: string,
  hostUserId: string,
  allowed: boolean,
) {
  const session = await assertIsHost(sessionId, hostUserId)
  // L'animateur partage de plein droit : il n'y a rien à s'accorder, et lui
  // offrir le geste laisserait croire qu'il peut se le retirer.
  if (targetUserId === hostUserId) throw new Error('HOST_ALWAYS_SHARES')

  const target = await db.liveParticipant.findUnique({
    where: { sessionId_userId: { sessionId, userId: targetUserId } },
    select: { mutedByHost: true },
  })
  if (!target) throw new Error('PARTICIPANT_NOT_FOUND')

  await db.liveParticipant.update({
    where: { sessionId_userId: { sessionId, userId: targetUserId } },
    data: {
      screenAllowedAt: allowed ? new Date() : null,
      ...(allowed ? { screenRequestedAt: null } : {}),
    },
  })

  // Le verrou de micro est relu et repoussé tel quel : LiveKit remplace toute
  // la permission à chaque mise à jour, et ne pas la porter ici rendrait la
  // parole à quelqu'un à qui on ne voulait qu'accorder un écran.
  await setParticipantCanPublish(session.roomName, targetUserId, !target.mutedByHost, allowed)

  await auditStandalone({
    actorId: hostUserId, actorRole: 'TRAINER',
    action: allowed ? 'LIVE_SCREEN_GRANTED' : 'LIVE_SCREEN_REVOKED',
    targetType: 'LiveSession', targetId: sessionId,
    meta: { targetUserId },
  })

  return { allowed }
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

  // Donner la parole, c'est asseoir quelqu'un sur la scène (arbitrage 93). La
  // place se prend **avant** de lever le verrou : lever le verrou d'abord
  // laisserait, le temps d'un échec, un participant délivré mais toujours muet
  // côté transport, sans que rien à l'écran ne l'explique.
  if (!muted) {
    const seat = await claimStageSeat(sessionId, targetUserId)
    if (seat === 'MISSING') throw new Error('PARTICIPANT_NOT_FOUND')
    if (seat === 'FULL') throw new Error('STAGE_FULL')
  }

  const updated = await db.liveParticipant.updateMany({
    where: { sessionId, userId: targetUserId },
    data: {
      mutedByHost: muted,
      // Couper rend la place : la garder pour quelqu'un qui ne peut pas publier
      // priverait de parole un participant qui, lui, le pourrait.
      // Donner la parole lève le verrou **et** baisse la main d'un même geste
      // (arbitrage 41) : laisser la main levée ferait figurer indéfiniment dans
      // la file quelqu'un qui a déjà obtenu ce qu'il demandait.
      ...(muted ? { onStage: false } : { handRaisedAt: null }),
    },
  })
  if (updated.count === 0) throw new Error('PARTICIPANT_NOT_FOUND')

  // Arbitrage 144 — l'autorisation d'écran est relue et repoussée avec le
  // verrou : LiveKit remplace toute la permission à chaque mise à jour, si bien
  // qu'un simple « couper le micro » retirerait au passage un partage d'écran
  // que personne n'a voulu interrompre.
  const screen = await db.liveParticipant.findUnique({
    where: { sessionId_userId: { sessionId, userId: targetUserId } },
    select: { screenAllowedAt: true },
  })
  await setParticipantCanPublish(session.roomName, targetUserId, !muted, screen?.screenAllowedAt != null)

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
    select: { userId: true, screenAllowedAt: true },
  })

  // La scène se vide en même temps que les micros se coupent : neuf places
  // tenues par des gens qu'on vient de faire taire n'attendraient plus rien.
  await db.liveParticipant.updateMany({
    where: { sessionId, userId: { not: hostUserId } },
    data: { mutedByHost: true, onStage: false },
  })

  for (const target of targets) {
    // Couper tous les micros ne retire pas les écrans accordés (arbitrage 144) :
    // c'est même la situation qui les rend utiles — une salle silencieuse où
    // une personne montre son travail.
    await setParticipantCanPublish(
      session.roomName, target.userId, false, target.screenAllowedAt !== null,
    )
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
  /** Sa photo de profil, quand il en a déposé une. */
  avatarUrl: string | null
}

export interface AgendaSession {
  id: string
  title: string
  description: string | null
  status: LiveSessionStatus
  startsAt: Date
  /**
   * Fuseau dans lequel l'animateur a pensé l'heure (arbitrage 107). L'écran
   * ne le rappelle que s'il diffère de celui du lecteur : sinon il ajouterait
   * du bruit à une évidence.
   */
  timeZone: string | null
  durationMinutes: number
  /**
   * `id` en plus du nom et du slug : l'accueil retrouve par lui la bannière et
   * le portrait de la communauté (`lib/community-visual.ts`). Les clés de
   * stockage, elles, restent hors de ce type — il part vers le navigateur.
   */
  community: ViewCommunity & { id: string }
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

/**
 * Exporté avec `toAgenda` pour l'onglet « Tendance » de l'accueil
 * (`lib/trending.ts`) : une séance y a la même forme qu'ici, et une seconde
 * sélection aurait dérivé au premier champ ajouté.
 */
export const AGENDA_SELECT = {
  id: true, title: true, description: true, status: true,
  scheduledStartAt: true, timeZone: true, durationMinutes: true,
  peakParticipants: true, startedAt: true,
  communityId: true,
  community: {
    select: {
      name: true, slug: true,
      trainerProfile: {
        select: {
          slogan: true,
          user: { select: { id: true, fullName: true, avatarS3Key: true, avatarUrl: true } },
        },
      },
    },
  },
  _count: { select: { participants: { where: { leftAt: null } } } },
} as const

export function toAgenda(s: {
  id: string; title: string; description: string | null; status: LiveSessionStatus
  scheduledStartAt: Date; timeZone: string | null
  durationMinutes: number; peakParticipants: number
  communityId: string
  community: {
    name: string; slug: string
    trainerProfile: {
      slogan: string | null
      user: { id: string; fullName: string | null; avatarS3Key: string | null; avatarUrl: string | null }
    }
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
    timeZone: s.timeZone,
    durationMinutes: s.durationMinutes,
    community: { id: s.communityId, name: s.community.name, slug: s.community.slug },
    host: {
      name: s.community.trainerProfile.user.fullName ?? 'Formateur NKAMVA',
      role: s.community.trainerProfile.slogan ?? 'Formateur',
      avatarUrl: userAvatarSrc(s.community.trainerProfile.user),
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
  /**
   * Fuseau de la séance enregistrée (arbitrage 107) — nul si elle a été
   * programmée avant. Le replay porte la date du live : son premier rendu
   * l'écrit dans le fuseau où la ligne d'agenda l'écrivait
   * (`hooks/use-reader-time-zone.ts`).
   */
  timeZone: string | null
  durationSeconds: number
  status: string
  community: ViewCommunity
  host: ViewHost
  /** Arbitrage 55 — droit uniforme de tout membre, aucune case par séance. */
  downloadable: boolean
  /**
   * Arbitrage 94 — une variante audio existe-t-elle pour cette séance ?
   *
   * Les replays antérieurs à la bascule vers le stockage objet n'en ont pas, et
   * ceux hébergés par Mux non plus : l'écran ne peut donc pas la proposer
   * partout, il doit la lire ici.
   */
  hasAudioVariant: boolean
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
  status: true, purgeAt: true, communityId: true, s3Key: true, audioS3Key: true,
  session: { select: { description: true, timeZone: true } },
  community: {
    select: {
      name: true, slug: true,
      // `userId` sert à `getReplay` pour renseigner `mine` sans seconde requête.
      trainerProfile: {
        select: {
          userId: true, slogan: true,
          user: { select: { id: true, fullName: true, avatarS3Key: true, avatarUrl: true } },
        },
      },
    },
  },
} as const

function toReplay(r: {
  id: string; sessionId: string; title: string; recordedAt: Date
  durationSeconds: number | null; status: string; purgeAt: Date
  audioS3Key: string | null
  session: { description: string | null; timeZone: string | null }
  community: {
    name: string; slug: string
    trainerProfile: {
      userId: string
      slogan: string | null
      user: { id: string; fullName: string | null; avatarS3Key: string | null; avatarUrl: string | null }
    }
  }
}, mine: boolean): ReplayView {
  return {
    mine,
    id: r.id,
    sessionId: r.sessionId,
    title: r.title,
    description: r.session.description,
    recordedAt: r.recordedAt,
    timeZone: r.session.timeZone,
    // Le lecteur divise par cette valeur : un zéro y produirait une barre de
    // progression à NaN. Une séance sans durée connue vaut une seconde.
    durationSeconds: r.durationSeconds ?? 1,
    status: r.status,
    community: { name: r.community.name, slug: r.community.slug },
    host: {
      name: r.community.trainerProfile.user.fullName ?? 'Formateur NKAMVA',
      role: r.community.trainerProfile.slogan ?? 'Formateur',
      avatarUrl: userAvatarSrc(r.community.trainerProfile.user),
    },
    // Arbitrage 43 requalifié par 55 : les deux cadences ayant des droits
    // identiques, aucune ne refuse le téléchargement. C'est donc un droit
    // uniforme, et il n'y a **pas** de case « téléchargeable » par séance.
    downloadable: r.status === 'READY',
    hasAudioVariant: r.status === 'READY' && r.audioS3Key !== null,
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

/**
 * L'agenda d'une seule communauté — le salon « Sessions » de son espace membre.
 *
 * Aucun filtre d'accès sur les replays, et c'est délibéré : l'appelant est
 * `getCommunitySpace`, qui a déjà refusé l'entrée à qui n'est ni membre ni
 * animateur. Or `hasReplayAccess` accorde tout à un membre en cours — y compris
 * `PAST_DUE` et `BANNED`, les trois statuts ouverts. Qui voit cette page a donc
 * droit à tous ses replays, sans exception à filtrer ici. Le filtre par période
 * d'adhésion (arbitrages 34 et 44) ne concerne que les **anciens** membres, qui
 * passent par `/mes-lives` puisque ce salon leur est fermé.
 *
 * `isHost` porte le drapeau `mine` des deux listes : dans une communauté, on
 * anime tout ou on ne suit que — il n'y a pas de cas mixte à distinguer ligne
 * par ligne comme dans l'agenda global.
 */
export async function listCommunityLives(
  communityId: string,
  isHost: boolean,
): Promise<{ sessions: AgendaSession[]; replays: ReplayView[] }> {
  const [sessions, replays] = await Promise.all([
    db.liveSession.findMany({
      where: { communityId, status: { in: ['SCHEDULED', 'LIVE'] } },
      orderBy: { scheduledStartAt: 'asc' },
      take: 50,
      select: AGENDA_SELECT,
    }),
    db.replay.findMany({
      where: { communityId, purgedAt: null },
      orderBy: { recordedAt: 'desc' },
      take: 50,
      select: REPLAY_SELECT,
    }),
  ])

  return {
    sessions: sessions.map((s) => toAgenda(s, isHost)),
    replays: replays.map((r) => toReplay(r, isHost)),
  }
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

/** Un message du salon d'une séance, tel que le replay le rend. */
export interface ReplayMessage {
  id: string
  author: string
  body: string
  at: Date
  /**
   * Secondes écoulées depuis le début de l'enregistrement. Négatif pour ce qui
   * a été dit avant que la séance démarre — l'écran ne le situe pas dans la
   * vidéo, il l'affiche « avant le direct ».
   */
  offsetSeconds: number
}

/**
 * Le salon de la séance, rattaché à son replay (F6.7, arbitrage 42).
 *
 * Il existait, il était écrit, il était même conservé volontairement — le
 * schéma le dit à la colonne `deletedAt` de `LiveMessage` — et **aucun écran ne
 * le rendait** une fois la séance finie. Ce qui s'était dit pendant deux heures
 * de direct disparaissait avec le dernier participant.
 *
 * Les messages retirés par la Modération ne reviennent pas : le retrait vaut
 * pour le direct comme pour le replay, sans quoi instruire un propos ne
 * servirait à rien.
 *
 * L'accès est celui du replay, pas celui de la séance : c'est le même contenu,
 * et un ancien membre qui a droit au replay a droit à ce qui s'y est dit.
 */
export async function listReplayMessages(
  replayId: string,
  userId: string,
): Promise<ReplayMessage[]> {
  const replay = await db.replay.findFirst({
    where: { id: replayId, purgedAt: null },
    select: {
      ...REPLAY_SELECT,
      // `startedAt` vit sur la séance, pas sur le replay : c'est l'heure à
      // laquelle l'animateur a réellement ouvert la salle.
      session: { select: { description: true, startedAt: true } },
    },
  })
  if (!replay) throw new Error('REPLAY_NOT_FOUND')
  if (!(await hasReplayAccess(userId, replay))) throw new Error('NOT_MEMBER')

  const messages = await db.liveMessage.findMany({
    where: { sessionId: replay.sessionId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    take: 500,
    select: {
      id: true, body: true, createdAt: true,
      author: { select: { fullName: true } },
    },
  })

  // L'origine du minutage est le **début réel** de l'enregistrement quand on
  // l'a, et la date du replay sinon : caler sur l'heure programmée décalerait
  // tout le salon d'une séance commencée en retard.
  const origine = (replay.session.startedAt ?? replay.recordedAt).getTime()

  return messages.map((m) => ({
    id: m.id,
    author: m.author.fullName ?? 'Un participant',
    body: m.body,
    at: m.createdAt,
    offsetSeconds: Math.round((m.createdAt.getTime() - origine) / 1000),
  }))
}

/** URL signée de lecture ou de téléchargement. Droit uniforme (arbitrage 55). */
export async function getReplayUrl(
  replayId: string,
  userId: string,
  forDownload = false,
  /** Arbitrage 94 — `audio` sert la variante légère, quand elle existe. */
  variant: 'video' | 'audio' = 'video',
): Promise<string> {
  const replay = await db.replay.findFirst({
    where: { id: replayId, purgedAt: null },
    select: {
      id: true, communityId: true, recordedAt: true, s3Key: true, status: true,
      muxPlaybackId: true, audioS3Key: true,
    },
  })
  if (!replay) throw new Error('REPLAY_NOT_FOUND')
  if (!(await hasReplayAccess(userId, replay))) throw new Error('NOT_MEMBER')
  if (replay.status !== 'READY') throw new Error('REPLAY_UNAVAILABLE')

  // La variante audio n'existe que sur les replays enregistrés chez nous ; chez
  // Mux, c'est son lecteur adaptatif qui joue ce rôle. Demander l'audio d'un
  // replay qui n'en a pas est une erreur d'appel, pas un repli silencieux vers
  // 1,3 Go de vidéo sur une connexion qui vient d'en demander 60 Mo.
  if (variant === 'audio') {
    if (!replay.audioS3Key) throw new Error('REPLAY_AUDIO_UNAVAILABLE')
    return presignDownload(replay.audioS3Key)
  }

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
    select: {
      id: true, title: true, sizeBytes: true, audioSizeBytes: true,
      s3Key: true, audioS3Key: true, trainerId: true,
    },
  })

  for (const replay of expired) {
    // **L'objet part avant la ligne.** Oublier cette boucle — c'était le cas
    // jusqu'au 13 août 2026 — rendait le quota au formateur en base et laissait
    // les octets dans le seau : la facture de stockage, elle, ne baissait
    // jamais. Une purge qui ne purge que la comptabilité coûte plus cher que
    // pas de purge du tout, puisqu'elle autorise à reremplir la place.
    for (const key of [replay.s3Key, replay.audioS3Key]) {
      if (key) await deleteObject(key)
    }

    await db.replay.update({
      where: { id: replay.id },
      data: {
        purgedAt: now, status: 'PURGED',
        s3Key: null, sizeBytes: null, audioS3Key: null, audioSizeBytes: null,
      },
    })
    await auditStandalone({
      actorId: null, actorRole: 'SYSTEM',
      action: 'REPLAY_PURGED', targetType: 'Replay', targetId: replay.id,
      meta: {
        retentionMonths: REPLAY_RETENTION_MONTHS,
        freedBytes: Number(replay.sizeBytes ?? 0) + Number(replay.audioSizeBytes ?? 0),
      },
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
  // Arbitrage 103 — **une seule fois**, au franchissement du seuil. La fenêtre
  // était ouverte de maintenant à J-30, donc tous les replays concernés étaient
  // renotifiés à chaque passage : trente notifications identiques pour un seul
  // événement, soit la meilleure façon de faire ignorer un préavis.
  const window = {
    gt: new Date(now.getTime() + (DOWNLOAD_NOTICE_DAYS - 1) * 86_400_000),
    lte: new Date(now.getTime() + DOWNLOAD_NOTICE_DAYS * 86_400_000),
  }

  const soon = await db.replay.findMany({
    where: { purgedAt: null, purgeAt: window },
    select: {
      id: true, title: true, purgeAt: true,
      trainerProfile: { select: { userId: true } },
    },
  })

  let alerted = 0
  for (const replay of soon) {
    const sent = await sendNoticeOnce(
      `REPLAY_PURGE_NOTICE_${DOWNLOAD_NOTICE_DAYS}`,
      replay.id,
      replay.trainerProfile.userId,
      {
        type: 'REPLAY_PURGE_SOON',
        title: `« ${replay.title} » sera supprimé le ${replay.purgeAt.toLocaleDateString('fr-FR', { dateStyle: 'long' })}`,
        body: `Les replays sont conservés ${REPLAY_RETENTION_MONTHS} mois. La suppression vous rendra l'espace de stockage correspondant.`,
        // Droit sur l'enregistrement concerné : ce préavis existe pour qu'on le
        // télécharge, pas pour qu'on le cherche dans une liste.
        link: `/mes-lives/replay/${replay.id}`,
      },
      { days: DOWNLOAD_NOTICE_DAYS, purgeAt: replay.purgeAt.toISOString() },
    )
    if (sent) alerted += 1
  }

  return { alerted }
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
    /** `null` efface la clé annoncée à la clôture : l'egress audio a échoué. */
    audioS3Key?: string | null
    audioSizeBytes?: number
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
      ...(input.audioS3Key !== undefined ? { audioS3Key: input.audioS3Key } : {}),
      ...(input.audioSizeBytes !== undefined
        ? { audioSizeBytes: BigInt(input.audioSizeBytes) }
        : {}),
    },
  })
  await auditStandalone({
    actorId: null, actorRole: 'SYSTEM',
    action: 'REPLAY_READY', targetType: 'Replay', targetId: sessionId,
    meta: {
      sizeBytes: input.sizeBytes ?? 0,
      audioSizeBytes: input.audioSizeBytes ?? 0,
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
    select: {
      id: true, sessionId: true,
      session: { select: { egressId: true, audioEgressId: true } },
    },
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
      // La variante audio n'a pas voix au chapitre sur le statut du replay : si
      // elle échoue, il reste une vidéo, et annoncer `FAILED` pour un fichier
      // d'appoint ferait disparaître une séance parfaitement enregistrée.
      const audio = replay.session.audioEgressId
        ? await getEgressOutcome(replay.session.audioEgressId)
        : null

      await markReplayReady(replay.sessionId, {
        s3Key: outcome.s3Key,
        sizeBytes: outcome.sizeBytes,
        durationSeconds: outcome.durationSeconds,
        ...(audio?.done && audio.ok
          ? { audioS3Key: audio.s3Key, audioSizeBytes: audio.sizeBytes }
          : { audioS3Key: null }),
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

