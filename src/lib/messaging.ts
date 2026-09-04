// ==========================================================================
// Messagerie — fils privés et groupes (arbitrages 33, 39, 126, 129, 130)
// ==========================================================================
// Deux formes, un seul module, parce que ce sont deux formes de la même chose :
// des gens qui se parlent. Les séparer, c'était obliger un membre à jongler
// entre l'écran des messages et la page de chaque communauté pour suivre ce qui
// s'y dit.
//
//   DIRECT — un membre et le formateur. `learnerId` non nul.
//   GROUP  — tous les membres d'une communauté. `learnerId` nul : il n'y a
//            personne en face, il y a une communauté.
//
// **Qui peut écrire à qui.** L'arbitrage 33 tranche : le droit vient de
// l'adhésion, **pas de l'achat**. Quelqu'un qui a payé quinze ressources à
// l'unité n'a aucun fil ouvert ; un membre à 5 000 FCFA par mois en a un. C'est
// pourquoi une conversation porte `communityId` et non `courseId`.
//
// **La lecture survit à l'adhésion.** L'arbitrage 39 le disait du fil privé,
// l'arbitrage 129 l'étend au groupe : quand l'adhésion s'arrête, l'écriture
// cesse, la lecture reste. D'où deux gardes séparées — en avoir été suffit pour
// lire, il faut l'être encore pour écrire — et des conversations qu'aucune
// fermeture de souscription ne supprime.
//
// **L'unicité est partielle**, et elle l'est en SQL brut : un fil privé par
// (communauté, membre), un groupe par communauté. Prisma ne sait pas exprimer
// un index unique partiel, donc `findFirst` plutôt que `findUnique` sur ces
// deux chemins — voir la migration `conversations_de_groupe`.
//
// **Le compteur de non-lues passe par `ConversationRead`**, pas par
// `Message.readAt`. Celui-ci porte « lu par le destinataire », ce qui a un sens
// à deux et aucun à deux cents : dans un groupe, le premier membre à ouvrir
// aurait marqué le message lu pour tous les autres. `readAt` reste, mais pour
// ce qu'il sait faire — l'accusé d'un fil privé.
// ==========================================================================

import type { ConversationKind } from '@prisma/client'

import { db } from './db'
import { audit } from './audit'
import { notifyWithEmail, deliverSideEffects, absoluteUrl } from './notification'

export const MESSAGE_MAX_LENGTH = 5000

/** Voir `memberships.ts` — les listes de statuts ouverts restent alignées. */
const OPEN_STATUSES = ['ACTIVE', 'PAST_DUE', 'BANNED'] as const

export interface ConversationPeer {
  id: string
  fullName: string | null
}

export interface ConversationSummary {
  id: string
  kind: ConversationKind
  communityId: string
  communitySlug: string
  communityName: string
  /**
   * Ce qui s'affiche dans la liste : le nom de l'autre pour un fil privé, le nom
   * de la communauté pour un groupe. Calculé ici plutôt que dans l'écran — la
   * liste trie et cherche dessus, elle ne peut pas le reconstituer par cas.
   */
  title: string
  /** L'autre bout du fil. **Nul pour un groupe** : il n'y a personne en face. */
  peer: ConversationPeer | null
  /** `body` est nul quand le message a été retiré : le texte ne repart pas. */
  lastMessage: {
    body: string | null
    createdAt: Date
    mine: boolean
    deleted: boolean
    /** Qui parle — inutile à deux, nécessaire dans un groupe. */
    authorName: string | null
  } | null
  unreadCount: number
  /** Faux quand l'adhésion s'est arrêtée : le fil reste lisible (arbitrage 39). */
  canWrite: boolean
  /** Pourquoi il ne peut pas, quand il ne peut pas. */
  readOnlyReason: WriteBlock
  /** Épinglée par le lecteur, ou d'office s'il anime cette communauté. */
  pinned: boolean
  /** Vrai pour l'épingle systématique du formateur sur son groupe : non retirable. */
  pinnedBySystem: boolean
}

export interface ConversationThread extends ConversationSummary {
  messages: Array<{
    id: string
    /** Nul quand le message a été retiré par la Modération. */
    body: string | null
    createdAt: Date
    mine: boolean
    readAt: Date | null
    deleted: boolean
    /** Annonce du formateur : épinglée en tête du groupe (arbitrage 128). */
    announcement: boolean
    authorName: string | null
  }>
}

// --- Droit d'écrire ---

/** Pourquoi la saisie est fermée. `null` quand elle ne l'est pas. */
export type WriteBlock =
  | 'MEMBERSHIP_ENDED'
  | 'MEMBER_BANNED'
  | 'ACCOUNT_RESTRICTED'
  | 'MESSAGING_DISABLED'
  | null

/**
 * Pourquoi ce fil est en lecture seule, ou `null` s'il ne l'est pas.
 *
 * Rendre la raison plutôt qu'un booléen : l'écran doit distinguer « votre
 * adhésion est terminée » de « vous avez été écarté de la parole ». Les deux
 * ferment la saisie, elles ne disent pas la même chose à la personne.
 */
async function writeBlockFor(
  communityId: string,
  learnerId: string,
  writerId: string,
  kind: ConversationKind = 'DIRECT',
): Promise<WriteBlock> {
  const [community, subscription, writer] = await Promise.all([
    db.community.findUnique({
      where: { id: communityId },
      select: {
        status: true, messagingEnabled: true, forumEnabled: true,
        trainerProfile: { select: { userId: true } },
      },
    }),
    db.communitySubscription.findFirst({
      where: { communityId, learnerId, status: { in: [...OPEN_STATUSES] } },
      select: { status: true },
    }),
    db.user.findUnique({ where: { id: writerId }, select: { sanctionLevel: true } }),
  ])

  // Chaque surface a son interrupteur : `messagingEnabled` ferme les fils
  // privés, `forumEnabled` ferme le groupe. Les confondre reviendrait à ce que
  // couper l'un coupe l'autre, alors que le formateur les règle séparément.
  const ouvert = kind === 'GROUP' ? community?.forumEnabled : community?.messagingEnabled
  if (!community || community.status !== 'active' || !ouvert) {
    return 'MESSAGING_DISABLED'
  }
  // Arbitrage 63 — la restriction vise celui qui écrit, quel que soit son bord.
  if (writer?.sanctionLevel !== 'NONE') return 'ACCOUNT_RESTRICTED'

  // Dans son propre groupe, le formateur passe : il n'adhère pas à sa
  // communauté — `initiateMembershipPayment` le lui refuse, et
  // `assertCanRead` l'a toujours laissé entrer sans souscription. Chercher la
  // sienne le mettait dehors de chez lui.
  //
  // La dispense s'arrête au groupe. Sur un fil privé, c'est l'adhésion **du
  // membre** qui décide, et l'arbitrage 33 vaut dans les deux sens : le
  // formateur n'écrit pas davantage à quelqu'un qui a quitté sa communauté.
  if (kind === 'GROUP' && community.trainerProfile.userId === writerId) return null

  // Arbitrage 33 — pas d'adhésion, pas de conversation.
  if (!subscription) return 'MEMBERSHIP_ENDED'
  // Arbitrage 40 — écarté de la parole. Le formateur, lui, garde la sienne :
  // bannir quelqu'un puis ne plus pouvoir le lui expliquer serait absurde.
  if (subscription.status === 'BANNED' && writerId === learnerId) return 'MEMBER_BANNED'
  return null
}

// --- Ouvrir ---

/**
 * Ouvre — ou retrouve — le fil d'un membre avec le formateur de la communauté.
 * Idempotente : deux appels rendent la même conversation, et l'unicité en base
 * tranche la course.
 */
export async function openConversation(
  communitySlug: string,
  userId: string,
): Promise<{ id: string }> {
  const community = await db.community.findFirst({
    where: { slug: communitySlug, status: 'active' },
    select: {
      id: true, trainerId: true, messagingEnabled: true,
      trainerProfile: { select: { userId: true } },
    },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')
  if (!community.messagingEnabled) throw new Error('MESSAGING_DISABLED')
  // Le formateur n'ouvre pas de fil « avec lui-même » : côté animateur, une
  // conversation naît toujours de celle d'un membre identifié.
  if (community.trainerProfile.userId === userId) throw new Error('NOT_MEMBER')

  const block = await writeBlockFor(community.id, userId, userId)
  if (block) throw new Error(block === 'MEMBERSHIP_ENDED' ? 'NOT_MEMBER' : block)

  const existing = await db.conversation.findFirst({
    where: { communityId: community.id, learnerId: userId, kind: 'DIRECT' },
    select: { id: true },
  })
  if (existing) return existing

  try {
    return await db.conversation.create({
      data: { communityId: community.id, learnerId: userId, trainerId: community.trainerId },
      select: { id: true },
    })
  } catch (err: unknown) {
    if ((err as { code?: string })?.code !== 'P2002') throw err
    return db.conversation.findFirstOrThrow({
      where: { communityId: community.id, learnerId: userId, kind: 'DIRECT' },
      select: { id: true },
    })
  }
}

/**
 * Ouvre — ou retrouve — le fil d'un de ses membres, à l'initiative du formateur.
 *
 * Jusqu'ici une conversation ne pouvait naître que du membre : le formateur
 * répondait, il n'abordait pas. La règle protégeait d'un démarchage qui n'a pas
 * lieu d'être ici — on écrit à quelqu'un qui paie déjà pour être dans le salon,
 * qui peut vous écrire de son côté, et seulement si les messages directs sont
 * ouverts. Elle coûtait surtout au cas qu'elle prétendait servir : prévenir un
 * membre d'un impayé, ou lui expliquer un bannissement, supposait d'attendre
 * qu'il écrive le premier.
 *
 * `writeBlockFor` reste le seul juge, et dans le même ordre : messages fermés,
 * compte restreint, adhésion terminée. Le membre banni fait exception et c'est
 * voulu — l'arbitrage 40 laisse sa parole au formateur, pour qu'il puisse
 * justement s'expliquer.
 */
export async function openConversationWithMember(
  communityId: string,
  learnerId: string,
  trainerUserId: string,
): Promise<{ id: string }> {
  const community = await db.community.findFirst({
    where: { id: communityId, status: 'active' },
    select: { id: true, trainerId: true, trainerProfile: { select: { userId: true } } },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')
  if (community.trainerProfile.userId !== trainerUserId) throw new Error('NOT_OWNER')
  // Un fil « avec soi-même » n'a pas de sens, et l'unicité en base le refuserait.
  if (learnerId === trainerUserId) throw new Error('NOT_MEMBER')

  const block = await writeBlockFor(community.id, learnerId, trainerUserId)
  if (block) throw new Error(block === 'MEMBERSHIP_ENDED' ? 'NOT_MEMBER' : block)

  const existing = await db.conversation.findFirst({
    where: { communityId: community.id, learnerId, kind: 'DIRECT' },
    select: { id: true },
  })
  if (existing) return existing

  try {
    return await db.conversation.create({
      data: { communityId: community.id, learnerId, trainerId: community.trainerId },
      select: { id: true },
    })
  } catch (err: unknown) {
    if ((err as { code?: string })?.code !== 'P2002') throw err
    return db.conversation.findFirstOrThrow({
      where: { communityId: community.id, learnerId, kind: 'DIRECT' },
      select: { id: true },
    })
  }
}

// --- Lire ---

const CONVERSATION_SELECT = {
  id: true,
  kind: true,
  communityId: true,
  learnerId: true,
  trainerId: true,
  lastMessageAt: true,
  community: {
    select: {
      slug: true, name: true, status: true, messagingEnabled: true, forumEnabled: true,
      trainerProfile: { select: { userId: true, user: { select: { id: true, fullName: true } } } },
    },
  },
  learner: { select: { id: true, fullName: true } },
} as const

type ConversationRow = {
  id: string
  kind: ConversationKind
  communityId: string
  learnerId: string | null
  trainerId: string
  lastMessageAt: Date | null
  community: {
    slug: string
    name: string
    trainerProfile: { userId: string; user: { id: string; fullName: string | null } }
  }
  learner: { id: string; fullName: string | null } | null
}

// --- Le groupe d'une communauté (arbitrage 126) ------------------------------

/**
 * Rend le groupe de la communauté, en le créant s'il n'existe pas encore.
 *
 * Création **paresseuse** plutôt qu'un remplissage par migration : une
 * communauté créée demain aurait eu besoin du même geste, et une migration ne
 * l'aurait pas couverte. Idempotente — l'index unique partiel tranche la course,
 * et le perdant relit la ligne du gagnant, comme `openConversation`.
 */
export async function ensureCommunityGroup(communityId: string): Promise<{ id: string }> {
  const existing = await db.conversation.findFirst({
    where: { communityId, kind: 'GROUP' },
    select: { id: true },
  })
  if (existing) return existing

  const community = await db.community.findUnique({
    where: { id: communityId },
    select: { trainerId: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')

  try {
    return await db.conversation.create({
      data: { communityId, kind: 'GROUP', trainerId: community.trainerId, learnerId: null },
      select: { id: true },
    })
  } catch (err: unknown) {
    if ((err as { code?: string })?.code !== 'P2002') throw err
    return db.conversation.findFirstOrThrow({
      where: { communityId, kind: 'GROUP' },
      select: { id: true },
    })
  }
}

/**
 * A-t-il **déjà** été membre ? Y compris une adhésion close.
 *
 * C'est la garde de lecture d'un groupe (arbitrage 129) : un ancien membre le
 * lit sans y écrire, exactement comme son fil privé lui reste lisible
 * (arbitrage 39). La version qui ne regardait que les adhésions ouvertes lui
 * fermait le groupe au visage le jour où il partait.
 */
async function hasEverBeenMember(communityId: string, userId: string): Promise<boolean> {
  const any = await db.communitySubscription.findFirst({
    where: { communityId, learnerId: userId },
    select: { id: true },
  })
  return any !== null
}

// --- Résumé ------------------------------------------------------------------

async function toSummary(
  row: ConversationRow,
  userId: string,
  read: { lastReadAt: Date | null; pinnedAt: Date | null } | null,
): Promise<ConversationSummary> {
  const viewerIsTrainer = row.community.trainerProfile.userId === userId
  const isGroup = row.kind === 'GROUP'
  const peer = isGroup ? null : viewerIsTrainer ? row.learner : row.community.trainerProfile.user

  const [last, unreadCount, block] = await Promise.all([
    db.message.findFirst({
      where: { conversationId: row.id },
      orderBy: { createdAt: 'desc' },
      select: {
        body: true, createdAt: true, senderId: true, deletedAt: true,
        sender: { select: { fullName: true } },
      },
    }),
    db.message.count({
      // Le curseur de lecture, pour les deux formes. `Message.readAt` ne
      // pouvait pas servir un groupe — il porte « lu par le destinataire », ce
      // qui a un sens à deux et aucun à deux cents. Une règle unique plutôt que
      // deux comptages qui finiraient par diverger.
      //
      // Un message retiré ne réclame plus d'être lu : le compter enverrait
      // quelqu'un ouvrir un fil pour y trouver un vide.
      where: {
        conversationId: row.id,
        senderId: { not: userId },
        deletedAt: null,
        ...(read?.lastReadAt ? { createdAt: { gt: read.lastReadAt } } : {}),
      },
    }),
    // Pour un groupe, l'adhésion examinée est celle du lecteur : c'est lui qui
    // veut écrire. Pour un direct, c'est celle du membre du fil.
    writeBlockFor(row.communityId, isGroup ? userId : row.learnerId!, userId, row.kind),
  ])

  // L'épingle du formateur sur le groupe qu'il anime est systématique et non
  // retirable : c'est chez lui, et c'est la conversation qu'il ouvre en premier.
  const pinnedBySystem = isGroup && viewerIsTrainer

  return {
    id: row.id,
    kind: row.kind,
    communityId: row.communityId,
    communitySlug: row.community.slug,
    communityName: row.community.name,
    title: isGroup ? row.community.name : (peer?.fullName ?? 'Votre interlocuteur'),
    peer: peer ? { id: peer.id, fullName: peer.fullName } : null,
    lastMessage: last
      ? {
          body: last.deletedAt ? null : last.body,
          createdAt: last.createdAt,
          mine: last.senderId === userId,
          deleted: last.deletedAt !== null,
          authorName: last.sender.fullName,
        }
      : null,
    unreadCount,
    canWrite: block === null,
    readOnlyReason: block,
    pinned: pinnedBySystem || read?.pinnedAt != null,
    pinnedBySystem,
  }
}

// --- Liste -------------------------------------------------------------------

export type ConversationFilter = 'all' | 'unread' | 'groups'

export interface ListConversationsOptions {
  filter?: ConversationFilter
  /** Nom d'une personne, nom d'un groupe, ou mot dit dans un message. */
  search?: string
}

/**
 * Tous les fils de quelqu'un — privés et groupes, apprenant et formateur
 * confondus : un formateur reste un apprenant, et sa messagerie porte les deux.
 *
 * L'ordre est celui de l'arbitrage 130 : le groupe qu'on anime d'abord, puis ce
 * qu'on a épinglé soi-même, puis le reste par dernier message.
 */
export async function listMyConversations(
  userId: string,
  trainerProfileId: string | null,
  options: ListConversationsOptions = {},
): Promise<ConversationSummary[]> {
  // Les groupes des communautés dont on est — ou a été — membre. La lecture
  // survit à l'adhésion (arbitrage 129), donc aucun filtre de statut ici.
  const memberships = await db.communitySubscription.findMany({
    where: { learnerId: userId },
    select: { communityId: true },
    distinct: ['communityId'],
  })
  const communityIds = memberships.map((m) => m.communityId)

  const rows = await db.conversation.findMany({
    where: {
      OR: [
        { kind: 'DIRECT', learnerId: userId },
        ...(trainerProfileId ? [{ trainerId: trainerProfileId }] : []),
        ...(communityIds.length > 0
          ? [{ kind: 'GROUP' as const, communityId: { in: communityIds } }]
          : []),
      ],
    },
    orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
    take: 100,
    select: CONVERSATION_SELECT,
  })

  // Une seule lecture pour toutes les lignes : une par conversation aurait
  // multiplié les allers-retours par le nombre de fils affichés.
  const reads = new Map(
    (
      await db.conversationRead.findMany({
        where: { userId, conversationId: { in: rows.map((r) => r.id) } },
        select: { conversationId: true, lastReadAt: true, pinnedAt: true },
      })
    ).map((r) => [r.conversationId, r]),
  )

  let list = await Promise.all(
    rows.map((row) => toSummary(row as ConversationRow, userId, reads.get(row.id) ?? null)),
  )

  const needle = options.search?.trim().toLowerCase()
  if (needle) {
    // La recherche couvre le **corps des messages**, pas seulement les titres :
    // chercher un mot dit dans une conversation dont on a oublié le nom est le
    // cas courant. Les identifiants trouvés côté base rejoignent ceux que le
    // titre a déjà donnés.
    const hits = new Set(
      (
        await db.message.findMany({
          where: {
            conversationId: { in: rows.map((r) => r.id) },
            deletedAt: null,
            body: { contains: needle, mode: 'insensitive' },
          },
          select: { conversationId: true },
          distinct: ['conversationId'],
        })
      ).map((m) => m.conversationId),
    )
    list = list.filter((c) => c.title.toLowerCase().includes(needle) || hits.has(c.id))
  }

  if (options.filter === 'unread') list = list.filter((c) => c.unreadCount > 0)
  if (options.filter === 'groups') list = list.filter((c) => c.kind === 'GROUP')

  return list.sort((a, b) => {
    if (a.pinnedBySystem !== b.pinnedBySystem) return a.pinnedBySystem ? -1 : 1
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    const at = a.lastMessage?.createdAt.getTime() ?? 0
    const bt = b.lastMessage?.createdAt.getTime() ?? 0
    return bt - at
  })
}

/**
 * Épingle, ou retire l'épingle. L'épingle systématique du formateur sur son
 * groupe n'est pas concernée : elle n'est pas stockée, donc rien à retirer — et
 * la refuser explicitement vaut mieux qu'écrire une ligne sans effet.
 */
export async function setConversationPinned(
  conversationId: string,
  userId: string,
  trainerProfileId: string | null,
  pinned: boolean,
): Promise<{ pinned: boolean }> {
  const row = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, kind: true, communityId: true, learnerId: true, trainerId: true },
  })
  if (!row) throw new Error('CONVERSATION_NOT_FOUND')
  await assertParticipant(row, userId, trainerProfileId)

  if (row.kind === 'GROUP' && trainerProfileId !== null && row.trainerId === trainerProfileId) {
    throw new Error('PIN_IS_SYSTEM')
  }

  const at = pinned ? new Date() : null
  await db.conversationRead.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    update: { pinnedAt: at },
    create: { conversationId, userId, pinnedAt: at },
  })
  return { pinned }
}

/**
 * En être, à un titre ou à un autre. Un groupe s'ouvre à qui en a été membre
 * (arbitrage 129) ; un fil privé, à ses deux bouts.
 */
async function assertParticipant(
  row: { kind: ConversationKind; communityId: string; learnerId: string | null; trainerId: string },
  userId: string,
  trainerProfileId: string | null,
): Promise<void> {
  const isTrainer = trainerProfileId !== null && row.trainerId === trainerProfileId
  if (isTrainer) return
  if (row.kind === 'DIRECT') {
    if (row.learnerId !== userId) throw new Error('CONVERSATION_NOT_FOUND')
    return
  }
  if (!(await hasEverBeenMember(row.communityId, userId))) {
    throw new Error('CONVERSATION_NOT_FOUND')
  }
}

/**
 * Le fil complet. Ne demande pas l'adhésion, seulement d'en être : l'arbitrage
 * 39 veut qu'un ancien membre retrouve ce qui s'est dit.
 */
export async function getConversation(
  conversationId: string,
  userId: string,
  trainerProfileId: string | null,
): Promise<ConversationThread> {
  const row = await db.conversation.findUnique({
    where: { id: conversationId },
    select: CONVERSATION_SELECT,
  })
  if (!row) throw new Error('CONVERSATION_NOT_FOUND')
  await assertParticipant(row, userId, trainerProfileId)

  const read = await db.conversationRead.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { lastReadAt: true, pinnedAt: true },
  })

  const [summary, messages] = await Promise.all([
    toSummary(row as ConversationRow, userId, read),
    db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: {
        id: true, body: true, createdAt: true, senderId: true, readAt: true, deletedAt: true,
        announcement: true,
        // Le nom de l'auteur : inutile à deux, nécessaire dans un groupe où
        // chaque bulle vient de quelqu'un de différent.
        sender: { select: { fullName: true } },
      },
    }),
  ])

  return {
    ...summary,
    // Un message retiré garde sa place et son heure, jamais son texte : le
    // retrait ne doit pas devenir un moyen de le republier.
    messages: messages.map((m) => ({
      id: m.id,
      body: m.deletedAt ? null : m.body,
      createdAt: m.createdAt,
      mine: m.senderId === userId,
      readAt: m.readAt,
      deleted: m.deletedAt !== null,
      announcement: m.announcement,
      authorName: m.sender.fullName,
    })),
  }
}

// --- Écrire ---

export async function sendMessage(
  conversationId: string,
  userId: string,
  trainerProfileId: string | null,
  input: { body: string; announcement?: boolean },
): Promise<{ id: string }> {
  const body = input.body.trim()
  if (!body) throw new Error('BODY_REQUIRED')
  if (body.length > MESSAGE_MAX_LENGTH) throw new Error('MESSAGE_TOO_LONG')

  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true, kind: true, communityId: true, learnerId: true, trainerId: true,
      community: {
        select: { name: true, slug: true, trainerProfile: { select: { userId: true } } },
      },
    },
  })
  if (!conversation) throw new Error('CONVERSATION_NOT_FOUND')

  const viewerIsTrainer = trainerProfileId !== null && conversation.trainerId === trainerProfileId
  await assertParticipant(conversation, userId, trainerProfileId)

  const isGroup = conversation.kind === 'GROUP'
  const block = await writeBlockFor(
    conversation.communityId,
    isGroup ? userId : conversation.learnerId!,
    userId,
    conversation.kind,
  )
  if (block) throw new Error(block)

  // Arbitrage 128 — annoncer est un geste de formateur, et seulement dans un
  // groupe : on n'annonce rien à une seule personne. La règle ne peut pas être
  // une contrainte de base (un CHECK ne voit que sa propre ligne), elle est donc
  // ici, et testée.
  const announcement = input.announcement === true
  if (announcement && (!isGroup || !viewerIsTrainer)) throw new Error('ANNOUNCEMENT_NOT_ALLOWED')

  const message = await db.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: { conversationId, senderId: userId, body, announcement },
      select: { id: true, createdAt: true },
    })
    await tx.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: created.createdAt },
    })
    await audit(tx, {
      actorId: userId, actorRole: viewerIsTrainer ? 'TRAINER' : 'LEARNER',
      action: 'MESSAGE_SENT', targetType: 'Conversation', targetId: conversationId,
      meta: { communityId: conversation.communityId, messageId: created.id },
    })
    return created
  })

  // Un extrait, pas le message entier : l'aperçu doit donner envie d'ouvrir le
  // fil, pas s'y substituer — et une boîte mail n'est pas l'endroit où déverser
  // une conversation privée.
  const extrait = body.length > 140 ? `${body.slice(0, 140)}…` : body
  const lien = `/messagerie?fil=${conversationId}`

  // Qui est prévenu, et pourquoi pas plus.
  //
  //   · Fil privé      → l'autre. Il n'y a personne d'autre.
  //   · Groupe, annonce → tous les membres. C'est exactement ce que le marquage
  //                       veut dire, et la seule raison d'être de F12.9.
  //   · Groupe, message ordinaire → **personne**. Prévenir deux cents personnes
  //     à chaque phrase noierait le canal, ferait fuir la préférence
  //     relationnelle et consommerait des données sans demande (§10.2, règle
  //     11). Le compteur de non-lues est le signal ; il ne coûte rien.
  const destinataires = !isGroup
    ? [viewerIsTrainer ? conversation.learnerId! : conversation.community.trainerProfile.userId]
    : announcement
      ? (
          await db.communitySubscription.findMany({
            where: {
              communityId: conversation.communityId,
              status: { in: [...OPEN_STATUSES] },
              learnerId: { not: userId },
            },
            select: { learnerId: true },
            distinct: ['learnerId'],
          })
        ).map((s) => s.learnerId)
      : []

  if (destinataires.length > 0) {
    await deliverSideEffects('MESSAGE_SENT', { type: 'Conversation', id: conversationId }, async () => {
      for (const destinataire of destinataires) {
        await notifyWithEmail(
          destinataire,
          {
            type: announcement ? 'COMMUNITY_ANNOUNCEMENT' : 'MESSAGE',
            title: announcement
              ? `Annonce · ${conversation.community.name}`
              : `Nouveau message · ${conversation.community.name}`,
            body: extrait,
            link: lien,
          },
          {
            subject: announcement
              ? `NkamVa — annonce dans ${conversation.community.name}`
              : `NkamVa — nouveau message dans ${conversation.community.name}`,
            title: announcement ? 'Une annonce vous attend' : 'Vous avez reçu un message',
            paragraphs: [
              'Bonjour,',
              announcement
                ? `Votre formateur a publié une annonce dans ${conversation.community.name} :`
                : `Un nouveau message vous attend dans ${conversation.community.name} :`,
              `« ${extrait} »`,
            ],
            cta: { label: 'Ouvrir la conversation', url: absoluteUrl(lien) },
          },
          'relationalEmails',
        )
      }
    })
  }

  return { id: message.id }
}

/**
 * Marque comme lus les messages **reçus** dans ce fil. Ceux qu'on a envoyés
 * n'ont pas à l'être : `readAt` dit que le destinataire a vu, pas l'expéditeur.
 */
export async function markConversationRead(
  conversationId: string,
  userId: string,
  trainerProfileId: string | null,
): Promise<{ read: number }> {
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, kind: true, communityId: true, learnerId: true, trainerId: true },
  })
  if (!conversation) throw new Error('CONVERSATION_NOT_FOUND')
  await assertParticipant(conversation, userId, trainerProfileId)

  const now = new Date()

  // Le curseur, pour les deux formes : c'est lui qui décide du compteur.
  await db.conversationRead.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    update: { lastReadAt: now },
    create: { conversationId, userId, lastReadAt: now },
  })

  // L'accusé par message ne vaut que dans un fil privé, où « lu » désigne
  // quelqu'un de précis. Dans un groupe il ne désignerait personne : le premier
  // membre à ouvrir marquerait le message lu pour les deux cents autres.
  if (conversation.kind === 'DIRECT') {
    const { count } = await db.message.updateMany({
      where: { conversationId, senderId: { not: userId }, readAt: null },
      data: { readAt: now },
    })
    return { read: count }
  }

  return { read: 0 }
}

/**
 * Compteur de la pastille de navigation — **conversations** non lues, pas
 * messages.
 *
 * Il comptait les messages, ce qui restait juste tant qu'un fil n'avait que
 * deux voix. Un groupe actif ferait afficher « 247 » sur une pastille de la
 * barre de navigation, chiffre qui n'aide à rien et qu'aucun geste ne fait
 * baisser autrement qu'en lisant tout. Le nombre de conversations qui
 * attendent, lui, correspond à ce qu'on va effectivement ouvrir.
 *
 * Passe par la liste plutôt que par un `count` : le curseur de lecture vit dans
 * une autre table, et le refaire en SQL ici en ferait une seconde définition du
 * mot « non lu ».
 */
export async function countUnreadMessages(
  userId: string,
  trainerProfileId: string | null,
): Promise<number> {
  const list = await listMyConversations(userId, trainerProfileId, { filter: 'unread' })
  return list.length
}
