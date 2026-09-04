// ==========================================================================
// Messagerie 1 à 1 — arbitrages 33 et 39
// ==========================================================================
// L'écran `/messagerie` existait depuis le Lot 0 et affichait trois
// conversations de démonstration. Ce qui manquait n'était pas l'écran, c'était
// la réponse à une question : **qui peut écrire à qui ?**
//
// L'arbitrage 33 la tranche : le droit de conversation vient de l'adhésion à
// la communauté, **pas de l'achat**. Quelqu'un qui a payé quinze ressources à
// l'unité n'a aucun fil ouvert ; un membre à 5 000 FCFA par mois en a un. C'est
// pourquoi une conversation porte `communityId` et non `courseId`, et pourquoi
// il n'y en a qu'une par membre : une communauté n'a qu'un formateur.
//
// L'arbitrage 39 tranche la suite : **le fil survit à l'adhésion**. Quand elle
// s'arrête, l'écriture cesse, la lecture reste. D'où deux gardes séparées —
// participer suffit pour lire, il faut être membre pour écrire — et une
// conversation qu'aucune fermeture de souscription ne supprime.
//
// La conséquence pratique compte : un membre qui revient retrouve son fil là où
// il l'avait laissé. L'unicité `(communityId, learnerId)` est totale, pas
// partielle : un retour ne crée pas un second fil à côté du premier.
// ==========================================================================

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
  communityId: string
  communitySlug: string
  communityName: string
  /** L'autre bout du fil, vu du lecteur. */
  peer: ConversationPeer
  /** `body` est nul quand le message a été retiré : le texte ne repart pas. */
  lastMessage: { body: string | null; createdAt: Date; mine: boolean; deleted: boolean } | null
  unreadCount: number
  /** Faux quand l'adhésion s'est arrêtée : le fil reste lisible (arbitrage 39). */
  canWrite: boolean
  /** Pourquoi il ne peut pas, quand il ne peut pas. */
  readOnlyReason: 'MEMBERSHIP_ENDED' | 'MEMBER_BANNED' | 'ACCOUNT_RESTRICTED' | 'MESSAGING_DISABLED' | null
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
  }>
}

// --- Droit d'écrire ---

type WriteBlock = ConversationSummary['readOnlyReason']

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
): Promise<WriteBlock> {
  const [community, subscription, writer] = await Promise.all([
    db.community.findUnique({
      where: { id: communityId },
      select: { status: true, messagingEnabled: true },
    }),
    db.communitySubscription.findFirst({
      where: { communityId, learnerId, status: { in: [...OPEN_STATUSES] } },
      select: { status: true },
    }),
    db.user.findUnique({ where: { id: writerId }, select: { sanctionLevel: true } }),
  ])

  if (!community || community.status !== 'active' || !community.messagingEnabled) {
    return 'MESSAGING_DISABLED'
  }
  // Arbitrage 63 — la restriction vise celui qui écrit, quel que soit son bord.
  if (writer?.sanctionLevel !== 'NONE') return 'ACCOUNT_RESTRICTED'
  // Arbitrage 33 — pas d'adhésion, pas de conversation. Vrai des deux côtés :
  // le formateur n'écrit pas davantage à quelqu'un qui a quitté sa communauté.
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

  const existing = await db.conversation.findUnique({
    where: { communityId_learnerId: { communityId: community.id, learnerId: userId } },
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
    return db.conversation.findUniqueOrThrow({
      where: { communityId_learnerId: { communityId: community.id, learnerId: userId } },
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

  const existing = await db.conversation.findUnique({
    where: { communityId_learnerId: { communityId: community.id, learnerId } },
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
    return db.conversation.findUniqueOrThrow({
      where: { communityId_learnerId: { communityId: community.id, learnerId } },
      select: { id: true },
    })
  }
}

// --- Lire ---

const CONVERSATION_SELECT = {
  id: true,
  communityId: true,
  learnerId: true,
  trainerId: true,
  lastMessageAt: true,
  community: {
    select: {
      slug: true, name: true, status: true, messagingEnabled: true,
      trainerProfile: { select: { userId: true, user: { select: { id: true, fullName: true } } } },
    },
  },
  learner: { select: { id: true, fullName: true } },
} as const

type ConversationRow = {
  id: string
  communityId: string
  learnerId: string
  lastMessageAt: Date | null
  community: {
    slug: string
    name: string
    trainerProfile: { userId: string; user: { id: string; fullName: string | null } }
  }
  learner: { id: string; fullName: string | null }
}

async function toSummary(row: ConversationRow, userId: string): Promise<ConversationSummary> {
  const viewerIsTrainer = row.community.trainerProfile.userId === userId
  const peer = viewerIsTrainer ? row.learner : row.community.trainerProfile.user

  const [last, unreadCount, block] = await Promise.all([
    db.message.findFirst({
      where: { conversationId: row.id },
      orderBy: { createdAt: 'desc' },
      select: { body: true, createdAt: true, senderId: true, deletedAt: true },
    }),
    db.message.count({
      // Un message retiré ne réclame plus d'être lu : le compter enverrait le
      // destinataire ouvrir un fil pour y trouver un vide.
      where: { conversationId: row.id, readAt: null, senderId: { not: userId }, deletedAt: null },
    }),
    writeBlockFor(row.communityId, row.learnerId, userId),
  ])

  return {
    id: row.id,
    communityId: row.communityId,
    communitySlug: row.community.slug,
    communityName: row.community.name,
    peer: { id: peer.id, fullName: peer.fullName },
    lastMessage: last
      ? {
          body: last.deletedAt ? null : last.body,
          createdAt: last.createdAt,
          mine: last.senderId === userId,
          deleted: last.deletedAt !== null,
        }
      : null,
    unreadCount,
    canWrite: block === null,
    readOnlyReason: block,
  }
}

/**
 * Tous les fils de quelqu'un, apprenant et formateur confondus : un formateur
 * reste un apprenant, et sa messagerie porte les deux.
 */
export async function listMyConversations(
  userId: string,
  trainerProfileId: string | null,
): Promise<ConversationSummary[]> {
  const rows = await db.conversation.findMany({
    where: {
      OR: [
        { learnerId: userId },
        ...(trainerProfileId ? [{ trainerId: trainerProfileId }] : []),
      ],
    },
    orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
    take: 100,
    select: CONVERSATION_SELECT,
  })

  return Promise.all(rows.map((row) => toSummary(row as ConversationRow, userId)))
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

  const isParticipant =
    row.learnerId === userId ||
    (trainerProfileId !== null && row.trainerId === trainerProfileId)
  if (!isParticipant) throw new Error('CONVERSATION_NOT_FOUND')

  const [summary, messages] = await Promise.all([
    toSummary(row as ConversationRow, userId),
    db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: {
        id: true, body: true, createdAt: true, senderId: true, readAt: true, deletedAt: true,
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
    })),
  }
}

// --- Écrire ---

export async function sendMessage(
  conversationId: string,
  userId: string,
  trainerProfileId: string | null,
  input: { body: string },
): Promise<{ id: string }> {
  const body = input.body.trim()
  if (!body) throw new Error('BODY_REQUIRED')
  if (body.length > MESSAGE_MAX_LENGTH) throw new Error('MESSAGE_TOO_LONG')

  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true, communityId: true, learnerId: true, trainerId: true,
      community: {
        select: { name: true, trainerProfile: { select: { userId: true } } },
      },
    },
  })
  if (!conversation) throw new Error('CONVERSATION_NOT_FOUND')

  const viewerIsTrainer = trainerProfileId !== null && conversation.trainerId === trainerProfileId
  if (conversation.learnerId !== userId && !viewerIsTrainer) throw new Error('CONVERSATION_NOT_FOUND')

  const block = await writeBlockFor(conversation.communityId, conversation.learnerId, userId)
  if (block) throw new Error(block)

  const recipientId = viewerIsTrainer
    ? conversation.learnerId
    : conversation.community.trainerProfile.userId

  const message = await db.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: { conversationId, senderId: userId, body },
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

  await deliverSideEffects('MESSAGE_SENT', { type: 'Conversation', id: conversationId }, () =>
    notifyWithEmail(
      recipientId,
      {
        type: 'MESSAGE',
        title: `Nouveau message · ${conversation.community.name}`,
        body: extrait,
        link: `/messagerie?fil=${conversationId}`,
      },
      {
        subject: `NkamVa — nouveau message dans ${conversation.community.name}`,
        title: 'Vous avez reçu un message',
        paragraphs: [
          'Bonjour,',
          `Un nouveau message vous attend dans ${conversation.community.name} :`,
          `« ${extrait} »`,
        ],
        cta: {
          label: 'Ouvrir la conversation',
          url: absoluteUrl(`/messagerie?fil=${conversationId}`),
        },
      },
      'relationalEmails',
    ),
  )

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
    select: { id: true, learnerId: true, trainerId: true },
  })
  if (!conversation) throw new Error('CONVERSATION_NOT_FOUND')
  const isParticipant =
    conversation.learnerId === userId ||
    (trainerProfileId !== null && conversation.trainerId === trainerProfileId)
  if (!isParticipant) throw new Error('CONVERSATION_NOT_FOUND')

  const { count } = await db.message.updateMany({
    where: { conversationId, senderId: { not: userId }, readAt: null },
    data: { readAt: new Date() },
  })
  return { read: count }
}

/** Compteur de la pastille de navigation. */
export async function countUnreadMessages(
  userId: string,
  trainerProfileId: string | null,
): Promise<number> {
  return db.message.count({
    where: {
      readAt: null,
      senderId: { not: userId },
      deletedAt: null,
      conversation: {
        OR: [
          { learnerId: userId },
          ...(trainerProfileId ? [{ trainerId: trainerProfileId }] : []),
        ],
      },
    },
  })
}
