// ==========================================================================
// Espace membre d'une communauté — ressources incluses et sessions
// ==========================================================================
// Ce module ne sert plus que les **gardes** et l'identité de l'espace. Le fil
// collectif est devenu un groupe de la messagerie (arbitrage 126), et les
// billets ont basculé en messages : voir `lib/messaging.ts`.
//
// Une seule règle décide de tout ce qui reste, et elle vient de trois
// arbitrages qui disent la même chose sous trois angles :
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
// Ces gardes valent pour **l'espace** — ses ressources incluses et ses
// sessions. Celles du groupe vivent dans `messaging.ts` et ne disent pas tout à
// fait la même chose : l'arbitrage 129 y laisse l'ancien membre lire, là où cet
// espace-ci se ferme à qui n'est plus membre.
// ==========================================================================

import { db } from './db'

/** Voir `memberships.ts` — les trois listes doivent rester alignées. */
const OPEN_STATUSES = ['ACTIVE', 'PAST_DUE', 'BANNED'] as const

export interface CommunitySpace {
  communityId: string
  slug: string
  name: string
  /** Mensualité de l'adhésion, affichée par le pavé d'adhésion du salon. */
  priceFcfa: number
  /** Le groupe de la communauté est-il ouvert ? */
  forumEnabled: boolean
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
export async function resolveViewer(communityId: string, userId: string): Promise<Viewer> {
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

export function assertCanSpeak(viewer: Viewer): void {
  assertCanRead(viewer)
  const reason = mutedReason(viewer)
  if (reason === 'RESTRICTED') throw new Error('ACCOUNT_RESTRICTED')
  if (reason === 'BANNED') throw new Error('MEMBER_BANNED')
}

// --- Lecture ---


/** L'identité de l'espace et les droits du lecteur. */
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
        forumEnabled: true, messagingEnabled: true,
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

  return {
    communityId: community.id,
    slug: community.slug,
    name: community.name,
    priceFcfa: community.priceFcfa,
    forumEnabled: community.forumEnabled,
    resourcesEnabled: community.resourcesEnabled,
    eventsEnabled: community.eventsEnabled,
    messagingEnabled: community.messagingEnabled,
    trainerId: community.trainerId,
    trainerName: community.trainerProfile.user.fullName,
    isTrainer: viewer.isTrainer,
    canSpeak: mutedReason(viewer) === null,
    mutedReason: mutedReason(viewer),
  }
}

// --- Écriture : plus rien ici (arbitrage 126) --------------------------------
//
// `createPost`, `replyToPost`, `deletePost`, `deleteReply` et `togglePinned`
// vivaient ici. Le fil collectif est devenu un groupe de la messagerie, et
// c'est `lib/messaging.ts` qui porte l'écriture — une seule, pour les deux
// formes de conversation.
//
// Les laisser aurait été pire qu'inutile : elles écrivaient dans des tables que
// la bascule a vidées et que plus rien ne lit. Un appelant oublié y aurait
// déposé un billet invisible, sans erreur.

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
    // Les messages du **groupe**, depuis que le forum y a basculé (arbitrage
    // 126). Continuer de compter `CommunityPost` aurait figé ce chiffre à zéro
    // pour toujours — la fiche publique aurait annoncé une communauté morte le
    // lendemain de la bascule.
    //
    // Les fils privés n'y entrent pas : ce compteur dit l'animation du salon,
    // pas le volume des conversations à deux, qui ne regardent personne.
    const messages = await db.message.count({
      where: {
        conversation: { communityId: community.id, kind: 'GROUP' },
        createdAt: { gte: since },
        deletedAt: null,
      },
    })
    const perDay = Math.round(messages / 7)
    if (perDay === community.messagesPerDay) continue
    await db.community.update({
      where: { id: community.id },
      data: { messagesPerDay: perDay },
    })
    updated += 1
  }

  return { updated }
}
