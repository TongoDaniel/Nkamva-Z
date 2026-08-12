// ==========================================================================
// Espace membre d'une communauté — annonces et fil de discussion
// ==========================================================================
// Deux salons, activés séparément sur la communauté depuis le Lot 0 et
// annoncés publiquement sans que rien ne les serve jusqu'ici :
//
//   ANNOUNCEMENT — `broadcastEnabled`. Le formateur parle à sa communauté.
//   DISCUSSION   — `forumEnabled`. Les membres se parlent entre eux.
//
// Une seule règle décide de tout le reste, et elle vient de trois arbitrages
// qui disent la même chose sous trois angles :
//
//   **La lecture et la parole ne se retirent pas ensemble.**
//
//   · Arbitrage 40 — le membre banni d'une communauté est écarté de la parole,
//     pas de l'accès.
//   · Arbitrage 63 — un compte restreint lit tout ce qu'il a payé, il n'écrit
//     plus. Un compte exclu, lui, ne lit plus rien.
//   · Décision 68 — l'impayé ne coupe jamais la lecture. Un membre en sursis
//     reste un membre : il lit, et il parle.
//
// D'où deux gardes distinctes — `assertCanRead` et `assertCanSpeak` — et non
// un unique « est membre ». Les confondre ferait taire des gens qu'on voulait
// seulement laisser entrer, ou parler des gens qu'on avait écartés.
//
// Ce que ce module ne fait pas : il ne donne aucun accès résiduel après la
// sortie. Les arbitrages 34 et 48 conservent à l'ancien membre ses
// **ressources** et ses **replays**, nommément ; le fil de la communauté n'y
// figure pas. Quitter une communauté, c'est quitter sa conversation.
// ==========================================================================

import type { CommunityPostKind } from '@prisma/client'
import { db } from './db'
import { audit } from './audit'
import { notify, deliverSideEffects } from './notification'

export const POST_MAX_LENGTH = 5000

/** Voir `memberships.ts` — les trois listes doivent rester alignées. */
const OPEN_STATUSES = ['ACTIVE', 'PAST_DUE', 'BANNED'] as const

export interface SpaceAuthor {
  id: string
  fullName: string | null
  /** L'animateur de la communauté, signalé comme tel dans le fil. */
  isTrainer: boolean
}

export interface SpaceReply {
  id: string
  body: string | null
  createdAt: Date
  author: SpaceAuthor
  deleted: boolean
  /** Le lecteur en est-il l'auteur ? On ne se signale pas soi-même. */
  mine: boolean
}

export interface SpacePost {
  id: string
  kind: CommunityPostKind
  body: string | null
  pinned: boolean
  createdAt: Date
  lastReplyAt: Date | null
  repliesCount: number
  author: SpaceAuthor
  deleted: boolean
  /** Le lecteur en est-il l'auteur ? On ne se signale pas soi-même. */
  mine: boolean
  replies: SpaceReply[]
  /** Le lecteur peut-il retirer ce message ? */
  canDelete: boolean
}

export interface CommunitySpace {
  communityId: string
  slug: string
  name: string
  /** Mensualité de l'adhésion, affichée par le pavé d'adhésion du salon. */
  priceFcfa: number
  forumEnabled: boolean
  broadcastEnabled: boolean
  resourcesEnabled: boolean
  eventsEnabled: boolean
  messagingEnabled: boolean
  trainerId: string
  trainerName: string | null
  /** Le lecteur anime-t-il cette communauté ? */
  isTrainer: boolean
  /** Peut-il écrire ? Faux pour un membre banni ou un compte restreint. */
  canSpeak: boolean
  /** Pourquoi il ne peut pas, quand il ne peut pas. */
  mutedReason: 'BANNED' | 'RESTRICTED' | null
  announcements: SpacePost[]
  discussions: SpacePost[]
}

// --- Gardes ---

interface Viewer {
  communityId: string
  trainerId: string
  isTrainer: boolean
  subscriptionStatus: (typeof OPEN_STATUSES)[number] | null
  sanctionLevel: string
}

/**
 * Assemble le lecteur à partir de lectures déjà faites. Ne touche pas la base :
 * c'est ce qui permet à l'appelant de lancer ces lectures en parallèle plutôt
 * que de les enchaîner.
 */
function viewerFrom(
  communityId: string,
  userId: string,
  community: { trainerId: string; trainerProfile: { userId: string } },
  subscription: { status: string } | null,
  user: { sanctionLevel: string } | null,
): Viewer {
  return {
    communityId,
    trainerId: community.trainerId,
    isTrainer: community.trainerProfile.userId === userId,
    subscriptionStatus: (subscription?.status as Viewer['subscriptionStatus']) ?? null,
    sanctionLevel: user?.sanctionLevel ?? 'NONE',
  }
}

/**
 * Qui est le lecteur pour cette communauté ? Résolu une fois, réutilisé par les
 * deux gardes : les interroger séparément multiplierait les requêtes et, pire,
 * laisserait diverger la lecture qu'elles font de la même situation.
 *
 * Réservé aux appelants qui n'ont que l'identifiant. Ceux qui viennent de lire
 * la communauté passent par `viewerFrom`, qui n'ajoute aucun aller-retour.
 */
async function resolveViewer(communityId: string, userId: string): Promise<Viewer> {
  const [community, subscription, user] = await Promise.all([
    db.community.findUnique({
      where: { id: communityId },
      select: { trainerId: true, trainerProfile: { select: { userId: true } } },
    }),
    db.communitySubscription.findFirst({
      where: { communityId, learnerId: userId, status: { in: [...OPEN_STATUSES] } },
      select: { status: true },
    }),
    db.user.findUnique({ where: { id: userId }, select: { sanctionLevel: true } }),
  ])
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')

  return viewerFrom(communityId, userId, community, subscription, user)
}

/**
 * Entrer dans l'espace. Le formateur y entre toujours — c'est chez lui, il n'y
 * adhère pas (voir `initiateMembershipPayment`). Un compte exclu n'entre nulle
 * part : l'arbitrage 63 lui retire jusqu'à ses achats.
 */
function assertCanRead(viewer: Viewer): void {
  if (viewer.sanctionLevel === 'BANNED') throw new Error('ACCOUNT_BANNED')
  if (viewer.isTrainer) return
  if (!viewer.subscriptionStatus) throw new Error('NOT_MEMBER')
}

function mutedReason(viewer: Viewer): 'BANNED' | 'RESTRICTED' | null {
  if (viewer.sanctionLevel === 'RESTRICTED') return 'RESTRICTED'
  if (viewer.subscriptionStatus === 'BANNED') return 'BANNED'
  return null
}

function assertCanSpeak(viewer: Viewer): void {
  assertCanRead(viewer)
  const reason = mutedReason(viewer)
  if (reason === 'RESTRICTED') throw new Error('ACCOUNT_RESTRICTED')
  if (reason === 'BANNED') throw new Error('MEMBER_BANNED')
}

// --- Lecture ---

const AUTHOR = { id: true, fullName: true } as const

/** Contenu complet de l'espace : les deux salons, dans leur ordre d'affichage. */
export async function getCommunitySpace(slug: string, userId: string): Promise<CommunitySpace> {
  // Les trois lectures partent ensemble. L'abonnement se filtrait par
  // `communityId`, ce qui obligeait à attendre la communauté : le filtre passe
  // par la relation, si bien que le slug suffit. Un aller-retour de moins —
  // et il compte, mesuré à 223 ms depuis le poste de développement.
  const [community, subscription, user] = await Promise.all([
    db.community.findFirst({
      where: { slug, status: 'active' },
      select: {
        id: true, slug: true, name: true, trainerId: true, priceFcfa: true,
        forumEnabled: true, broadcastEnabled: true, messagingEnabled: true,
        resourcesEnabled: true, eventsEnabled: true,
        trainerProfile: { select: { userId: true, user: { select: { id: true, fullName: true } } } },
      },
    }),
    db.communitySubscription.findFirst({
      where: {
        community: { slug, status: 'active' },
        learnerId: userId,
        status: { in: [...OPEN_STATUSES] },
      },
      select: { status: true },
    }),
    db.user.findUnique({ where: { id: userId }, select: { sanctionLevel: true } }),
  ])
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')

  const viewer = viewerFrom(community.id, userId, community, subscription, user)
  assertCanRead(viewer)

  const trainerUserId = community.trainerProfile.userId
  const posts = await db.communityPost.findMany({
    where: { communityId: community.id },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    take: 100,
    select: {
      id: true, kind: true, body: true, pinned: true, createdAt: true,
      lastReplyAt: true, repliesCount: true, deletedAt: true, authorId: true,
      author: { select: AUTHOR },
      replies: {
        orderBy: { createdAt: 'asc' },
        take: 50,
        select: {
          id: true, body: true, createdAt: true, deletedAt: true, authorId: true,
          author: { select: AUTHOR },
        },
      },
    },
  })

  const toAuthor = (a: { id: string; fullName: string | null }): SpaceAuthor => ({
    id: a.id,
    fullName: a.fullName,
    isTrainer: a.id === trainerUserId,
  })

  // Un message retiré laisse sa place et son auteur, jamais son texte : le fil
  // doit rester lisible sans que le retrait devienne un moyen de le republier.
  const toPost = (p: (typeof posts)[number]): SpacePost => ({
    id: p.id,
    kind: p.kind,
    body: p.deletedAt ? null : p.body,
    pinned: p.pinned,
    createdAt: p.createdAt,
    lastReplyAt: p.lastReplyAt,
    repliesCount: p.repliesCount,
    author: toAuthor(p.author),
    deleted: Boolean(p.deletedAt),
    mine: p.authorId === userId,
    canDelete: !p.deletedAt && (viewer.isTrainer || p.authorId === userId),
    replies: p.replies.map((r) => ({
      id: r.id,
      body: r.deletedAt ? null : r.body,
      createdAt: r.createdAt,
      author: toAuthor(r.author),
      deleted: Boolean(r.deletedAt),
      mine: r.authorId === userId,
    })),
  })

  const all = posts.map(toPost)

  return {
    communityId: community.id,
    slug: community.slug,
    name: community.name,
    priceFcfa: community.priceFcfa,
    forumEnabled: community.forumEnabled,
    broadcastEnabled: community.broadcastEnabled,
    resourcesEnabled: community.resourcesEnabled,
    eventsEnabled: community.eventsEnabled,
    messagingEnabled: community.messagingEnabled,
    trainerId: community.trainerId,
    trainerName: community.trainerProfile.user.fullName,
    isTrainer: viewer.isTrainer,
    canSpeak: mutedReason(viewer) === null,
    mutedReason: mutedReason(viewer),
    announcements: all.filter((p) => p.kind === 'ANNOUNCEMENT'),
    discussions: all.filter((p) => p.kind === 'DISCUSSION'),
  }
}

// --- Écriture ---

export async function createPost(
  slug: string,
  userId: string,
  input: { kind: CommunityPostKind; body: string },
): Promise<{ id: string }> {
  const body = input.body.trim()
  if (!body) throw new Error('BODY_REQUIRED')
  if (body.length > POST_MAX_LENGTH) throw new Error('MESSAGE_TOO_LONG')

  const community = await db.community.findFirst({
    where: { slug, status: 'active' },
    select: { id: true, name: true, slug: true, forumEnabled: true, broadcastEnabled: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')

  const viewer = await resolveViewer(community.id, userId)
  assertCanSpeak(viewer)

  // Une annonce n'est pas un message parmi d'autres : elle porte la voix du
  // formateur, et un membre ne peut pas l'emprunter.
  if (input.kind === 'ANNOUNCEMENT') {
    if (!viewer.isTrainer) throw new Error('ANNOUNCEMENT_FORBIDDEN')
    if (!community.broadcastEnabled) throw new Error('SALON_DISABLED')
  } else if (!community.forumEnabled) {
    throw new Error('SALON_DISABLED')
  }

  const post = await db.$transaction(async (tx) => {
    const created = await tx.communityPost.create({
      data: { communityId: community.id, authorId: userId, kind: input.kind, body },
      select: { id: true },
    })
    await audit(tx, {
      actorId: userId, actorRole: viewer.isTrainer ? 'TRAINER' : 'LEARNER',
      action: 'COMMUNITY_POST_CREATED', targetType: 'CommunityPost', targetId: created.id,
      meta: { communityId: community.id, kind: input.kind },
    })
    return created
  })

  // Une annonce se pousse aux membres ; une discussion ne réveille personne.
  if (input.kind === 'ANNOUNCEMENT') {
    await deliverSideEffects(
      'COMMUNITY_ANNOUNCEMENT',
      { type: 'CommunityPost', id: post.id },
      () => notifyMembers(community.id, userId, {
        type: 'COMMUNITY_ANNOUNCEMENT',
        title: `Nouvelle annonce dans ${community.name}`,
        body: body.length > 140 ? `${body.slice(0, 140)}…` : body,
        link: `/mes-communautes/${community.slug}`,
      }),
    )
  }

  return post
}

export async function replyToPost(
  slug: string,
  postId: string,
  userId: string,
  input: { body: string },
): Promise<{ id: string }> {
  const body = input.body.trim()
  if (!body) throw new Error('BODY_REQUIRED')
  if (body.length > POST_MAX_LENGTH) throw new Error('MESSAGE_TOO_LONG')

  const community = await db.community.findFirst({
    where: { slug, status: 'active' },
    select: { id: true, forumEnabled: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')

  const viewer = await resolveViewer(community.id, userId)
  assertCanSpeak(viewer)

  const post = await db.communityPost.findFirst({
    where: { id: postId, communityId: community.id },
    select: { id: true, kind: true, deletedAt: true },
  })
  if (!post) throw new Error('POST_NOT_FOUND')
  // Un message retiré ne se prolonge pas : répondre à ce qui n'est plus visible
  // ne peut produire qu'une conversation illisible.
  if (post.deletedAt) throw new Error('POST_DELETED')
  // On répond sous une annonce même forum fermé : le salon désactivé est celui
  // des discussions entre membres, pas le droit de réagir au formateur.
  if (post.kind === 'DISCUSSION' && !community.forumEnabled) throw new Error('SALON_DISABLED')

  return db.$transaction(async (tx) => {
    const reply = await tx.communityPostReply.create({
      data: { postId, authorId: userId, body },
      select: { id: true },
    })
    await tx.communityPost.update({
      where: { id: postId },
      data: { repliesCount: { increment: 1 }, lastReplyAt: new Date() },
    })
    await audit(tx, {
      actorId: userId, actorRole: viewer.isTrainer ? 'TRAINER' : 'LEARNER',
      action: 'COMMUNITY_REPLY_CREATED', targetType: 'CommunityPost', targetId: postId,
      meta: { communityId: community.id, replyId: reply.id },
    })
    return reply
  })
}

// --- Retrait ---

/**
 * Retire un message. L'auteur retire le sien ; le formateur retire n'importe
 * lequel — c'est sa communauté, et la modération de premier niveau lui revient.
 *
 * Le retrait est un marquage, pas une suppression : le fil garde sa structure,
 * et ce qui a été modéré reste constatable.
 */
export async function deletePost(slug: string, postId: string, userId: string): Promise<void> {
  const community = await db.community.findFirst({
    where: { slug, status: 'active' },
    select: { id: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')

  const viewer = await resolveViewer(community.id, userId)
  assertCanRead(viewer)

  const post = await db.communityPost.findFirst({
    where: { id: postId, communityId: community.id },
    select: { id: true, authorId: true, deletedAt: true },
  })
  if (!post) throw new Error('POST_NOT_FOUND')
  if (post.deletedAt) throw new Error('POST_DELETED')
  if (!viewer.isTrainer && post.authorId !== userId) throw new Error('NOT_OWNER')

  await db.$transaction(async (tx) => {
    await tx.communityPost.update({
      where: { id: postId },
      data: { deletedAt: new Date(), deletedById: userId },
    })
    await audit(tx, {
      actorId: userId, actorRole: viewer.isTrainer ? 'TRAINER' : 'LEARNER',
      action: 'COMMUNITY_POST_DELETED', targetType: 'CommunityPost', targetId: postId,
      meta: {
        communityId: community.id,
        byAuthor: post.authorId === userId,
        moderated: viewer.isTrainer && post.authorId !== userId,
      },
    })
  })
}

export async function deleteReply(slug: string, replyId: string, userId: string): Promise<void> {
  const community = await db.community.findFirst({
    where: { slug, status: 'active' },
    select: { id: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')

  const viewer = await resolveViewer(community.id, userId)
  assertCanRead(viewer)

  const reply = await db.communityPostReply.findFirst({
    where: { id: replyId, post: { communityId: community.id } },
    select: { id: true, authorId: true, deletedAt: true, postId: true },
  })
  if (!reply) throw new Error('POST_NOT_FOUND')
  if (reply.deletedAt) throw new Error('POST_DELETED')
  if (!viewer.isTrainer && reply.authorId !== userId) throw new Error('NOT_OWNER')

  await db.$transaction(async (tx) => {
    await tx.communityPostReply.update({
      where: { id: replyId },
      data: { deletedAt: new Date(), deletedById: userId },
    })
    // `repliesCount` compte ce qui est encore lisible : le laisser inchangé
    // annoncerait des réponses que personne ne trouve.
    await tx.communityPost.update({
      where: { id: reply.postId },
      data: { repliesCount: { decrement: 1 } },
    })
    await audit(tx, {
      actorId: userId, actorRole: viewer.isTrainer ? 'TRAINER' : 'LEARNER',
      action: 'COMMUNITY_REPLY_DELETED', targetType: 'CommunityPost', targetId: reply.postId,
      meta: {
        communityId: community.id, replyId,
        moderated: viewer.isTrainer && reply.authorId !== userId,
      },
    })
  })
}

/** Épingle — ou détache — une discussion. Réservé au formateur. */
export async function togglePinned(slug: string, postId: string, userId: string) {
  const community = await db.community.findFirst({
    where: { slug, status: 'active' },
    select: { id: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')

  const viewer = await resolveViewer(community.id, userId)
  if (!viewer.isTrainer) throw new Error('NOT_OWNER')

  const post = await db.communityPost.findFirst({
    where: { id: postId, communityId: community.id },
    select: { id: true, pinned: true, deletedAt: true },
  })
  if (!post) throw new Error('POST_NOT_FOUND')
  if (post.deletedAt) throw new Error('POST_DELETED')

  return db.communityPost.update({
    where: { id: postId },
    data: { pinned: !post.pinned },
    select: { id: true, pinned: true },
  })
}

// --- Diffusion ---

/**
 * Prévient les membres d'une annonce, sauf son auteur. Un membre banni n'est
 * pas notifié : on ne pousse pas dans la boîte de quelqu'un une conversation
 * dont on l'a écarté — il la trouvera s'il vient la lire.
 */
async function notifyMembers(
  communityId: string,
  exceptUserId: string,
  params: { type: string; title: string; body: string; link: string },
): Promise<void> {
  const members = await db.communitySubscription.findMany({
    where: {
      communityId,
      status: { in: ['ACTIVE', 'PAST_DUE'] },
      learnerId: { not: exceptUserId },
    },
    select: { learnerId: true },
  })
  for (const member of members) await notify(member.learnerId, params)
}

// --- Statistique publique ---

/**
 * Recalcule `Community.messagesPerDay`, affiché sur la fiche publique et resté
 * à zéro depuis le Lot 0 faute de messages à compter. Moyenne sur sept jours :
 * assez courte pour refléter l'activité réelle, assez longue pour qu'une
 * journée creuse n'affiche pas une communauté morte.
 */
export async function refreshCommunityActivity(now = new Date()): Promise<{ updated: number }> {
  const since = new Date(now.getTime() - 7 * 86_400_000)

  const communities = await db.community.findMany({
    where: { status: 'active' },
    select: { id: true, messagesPerDay: true },
  })

  let updated = 0
  for (const community of communities) {
    const [posts, replies] = await Promise.all([
      db.communityPost.count({
        where: { communityId: community.id, createdAt: { gte: since }, deletedAt: null },
      }),
      db.communityPostReply.count({
        where: { post: { communityId: community.id }, createdAt: { gte: since }, deletedAt: null },
      }),
    ])
    const perDay = Math.round((posts + replies) / 7)
    if (perDay === community.messagesPerDay) continue
    await db.community.update({
      where: { id: community.id },
      data: { messagesPerDay: perDay },
    })
    updated += 1
  }

  return { updated }
}
