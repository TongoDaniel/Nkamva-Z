// ==========================================================================
// Communautés — lecture publique et ressources incluses
// ==========================================================================
// Arbitrages 45, 47 et 48.
//
// L'accès d'un membre à une ressource incluse ne se résume pas à « abonné
// actif ». La déliaison (48) impose de croiser deux périodes :
//
//   accès  ⟺  une période d'adhésion chevauche une période de liaison
//
// Un abonné actif à une ressource encore liée est le cas courant, où les deux
// périodes sont ouvertes. Mais un ancien membre garde ce qu'il a eu, et un
// membre actuel ne récupère pas ce qui a été délié avant son arrivée.
// Supprimer une ligne de liaison effacerait un droit acquis : elle est bornée,
// jamais détruite.
//
// Le parcours d'adhésion payant n'existe pas encore : ce module lit et lie,
// il ne vend pas.
// ==========================================================================

import { db } from './db'
import { audit, auditStandalone } from './audit'
import { notify, deliverSideEffects } from './notification'
import { canTrainerWrite } from './subscriptions'
import { trainerStorage } from './courses'
import { presignUpload, headObject, validateMagicNumber, deleteObject } from './s3'
import type { CourseListItem } from './dto'

/**
 * Statuts dont la période court encore. `BANNED` en fait partie : un membre
 * banni d'une communauté est écarté de la parole, pas de l'accès (arbitrage 40)
 * — même patron que la restriction de compte.
 */
const OPEN_STATUSES = ['ACTIVE', 'PAST_DUE', 'BANNED'] as const

export interface PublicCommunity {
  id: string
  slug: string
  name: string
  description: string | null
  priceFcfa: number
  membersCount: number
  coverS3Key: string | null
  forumEnabled: boolean
  eventsEnabled: boolean
  resourcesEnabled: boolean
  trainer: { id: string; fullName: string | null; slogan: string | null }
  includedCount: number
}

export async function listPublicCommunities(search?: string): Promise<PublicCommunity[]> {
  const rows = await db.community.findMany({
    where: {
      status: 'active',
      // Arbitrage 81 : une communauté privée sort de toutes les surfaces
      // publiques. `status` dit qu'elle vit, `visibility` dit qu'on peut la
      // trouver — les deux sont nécessaires.
      visibility: 'PUBLIC',
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { description: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    select: SELECT_PUBLIC,
    orderBy: [{ membersCount: 'desc' }, { createdAt: 'asc' }],
    take: 60,
  })
  return rows.map(toPublic)
}

/**
 * La fiche publique d'une communauté.
 *
 * Une communauté **privée** répond `null` — donc 404 côté page — sauf au membre
 * qui y est déjà (arbitrage 81). Un 403 dirait qu'elle existe, ce qui suffirait
 * à cartographier les communautés fermées en essayant des slugs.
 *
 * L'invité porteur d'un jeton valide, lui, ne passe pas par ici : il voit la
 * communauté depuis `/invitation/[token]`, où le jeton fait autorité.
 */
export async function getPublicCommunity(
  slug: string,
  viewerId?: string | null,
  /**
   * Identifiant de la communauté dont une invitation valide vient d'être
   * reconnue. C'est ce qui laisse un invité **pas encore membre** lire une
   * communauté privée pendant le tunnel d'adhésion payant : sans cette porte,
   * l'arbitrage 73 (le nominatif peut être payant) n'aurait aucun chemin
   * praticable. L'appelant a la charge d'avoir validé l'invitation.
   */
  allowPrivateCommunityId?: string | null,
) {
  const community = await db.community.findFirst({
    where: { slug, status: 'active' },
    select: {
      ...SELECT_PUBLIC, rules: true, messagesPerDay: true, broadcastEnabled: true,
      visibility: true,
      // Surcharge volontaire de `SELECT_PUBLIC` : `userId` sert au contrôle
      // ci-dessous, et n'a rien à faire dans la fiche publique.
      trainerProfile: { select: { id: true, slogan: true, userId: true, user: { select: { fullName: true } } } },
    },
  })
  if (!community) return null

  if (community.visibility === 'PRIVATE' && community.id !== allowPrivateCommunityId) {
    if (!viewerId) return null
    // Le formateur voit sa propre communauté fermée : il l'anime, il n'y adhère
    // pas, il n'apparaîtrait donc dans aucune souscription.
    if (community.trainerProfile.userId !== viewerId) {
      const member = await db.communitySubscription.count({
        where: { communityId: community.id, learnerId: viewerId, status: { in: [...OPEN_STATUSES] } },
      })
      if (member === 0) return null
    }
  }

  // Seules les ressources encore liées sont annoncées publiquement : c'est ce
  // qu'un futur membre recevra. Ce qui a été délié n'appartient plus à l'offre.
  const links = await db.communityCourse.findMany({
    where: { communityId: community.id, unlinkedAt: null },
    select: { linkedAt: true, course: { select: COURSE_CARD } },
    orderBy: { linkedAt: 'desc' },
  })

  return {
    ...toPublic(community),
    rules: community.rules,
    messagesPerDay: community.messagesPerDay,
    broadcastEnabled: community.broadcastEnabled,
    courses: links.map((l) => toCard(l.course)),
  }
}

// ==========================================================================
// Ouvrir et tenir sa communauté (formateur)
// ==========================================================================
// Ces fonctions manquaient entièrement. Le modèle, les adhésions, les salons,
// la messagerie, les lives et les invitations existaient tous — au-dessus d'un
// objet que rien ne savait créer. Les trois communautés du jeu de démonstration
// étaient écrites directement en base, faute de chemin.
//
// Un seul salon par formateur, à dessein : `Community.trainerId` n'est pas
// unique au schéma, mais tout le produit parle de « votre communauté » au
// singulier — la fiche formateur en affiche une, `listMyMemberships` en attend
// une par formateur. Autoriser la seconde demanderait de revoir ces écrans, pas
// d'ajouter une ligne.

/** Longueurs retenues pour rester lisibles sur une carte comme sur mobile. */
export const COMMUNITY_NAME_MAX = 80
export const COMMUNITY_DESCRIPTION_MAX = 2000
export const COMMUNITY_RULES_MAX = 2000

/**
 * Plancher du prix d'adhésion, aligné sur celui d'une ressource
 * (`createCourse`). En dessous, la commission de 15 % n'a plus de sens : elle
 * arrondirait à zéro.
 */
export const COMMUNITY_MIN_PRICE_FCFA = 500

export interface CommunityInput {
  name: string
  description?: string | null
  rules?: string | null
  priceFcfa: number
  forumEnabled?: boolean
  broadcastEnabled?: boolean
  messagingEnabled?: boolean
  resourcesEnabled?: boolean
  eventsEnabled?: boolean
}

/** Slug unique, dérivé du nom — même fabrique que celle des ressources. */
async function generateCommunitySlug(name: string, excludeId?: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-') || 'communaute'

  let slug = base
  let counter = 1
  while (true) {
    const existing = await db.community.findFirst({
      where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    })
    if (!existing) break
    slug = `${base}-${counter++}`
  }
  return slug
}

function assertCommunityInput(input: CommunityInput): void {
  if (!input.name.trim()) throw new Error('NAME_REQUIRED')
  if (input.name.length > COMMUNITY_NAME_MAX) throw new Error('NAME_TOO_LONG')
  if (!Number.isInteger(input.priceFcfa) || input.priceFcfa < COMMUNITY_MIN_PRICE_FCFA) {
    throw new Error('PRICE_TOO_LOW')
  }
  if ((input.description?.length ?? 0) > COMMUNITY_DESCRIPTION_MAX) throw new Error('DESCRIPTION_TOO_LONG')
  if ((input.rules?.length ?? 0) > COMMUNITY_RULES_MAX) throw new Error('RULES_TOO_LONG')
}

export async function createCommunity(
  trainerProfileId: string,
  userId: string,
  input: CommunityInput,
) {
  assertCommunityInput(input)

  // Décision 68 — un abonnement suspendu ferme les chemins d'écriture. Ouvrir
  // un salon payant en fait partie : il encaisserait des adhésions.
  if (!(await canTrainerWrite(trainerProfileId))) throw new Error('SUBSCRIPTION_SUSPENDED')

  const existing = await db.community.findFirst({
    where: { trainerId: trainerProfileId, status: 'active' },
    select: { id: true },
  })
  if (existing) throw new Error('COMMUNITY_ALREADY_EXISTS')

  const slug = await generateCommunitySlug(input.name)

  const community = await db.community.create({
    data: {
      trainerId: trainerProfileId,
      name: input.name.trim(),
      slug,
      description: input.description?.trim() || null,
      rules: input.rules?.trim() || null,
      priceFcfa: input.priceFcfa,
      forumEnabled: input.forumEnabled ?? true,
      broadcastEnabled: input.broadcastEnabled ?? true,
      messagingEnabled: input.messagingEnabled ?? true,
      resourcesEnabled: input.resourcesEnabled ?? true,
      eventsEnabled: input.eventsEnabled ?? true,
    },
  })

  await auditStandalone({
    actorId: userId, actorRole: 'TRAINER',
    action: 'COMMUNITY_CREATED', targetType: 'Community', targetId: community.id,
    meta: { name: community.name, slug, priceFcfa: community.priceFcfa },
  })

  return community
}

/**
 * Modifie le salon. Le **prix ne s'applique qu'aux adhésions à venir** : les
 * périodes déjà réglées portent leur montant, et `initiateMembershipPayment`
 * relit le prix courant à chaque échéance. Personne n'est débité de la
 * différence en cours de mois.
 *
 * Le slug suit le nom, comme pour une ressource. Une communauté renommée change
 * donc d'URL — c'est le comportement de `updateCourse`, et les liens partagés
 * y survivent mal. Le nom est le seul champ dans ce cas ; le signaler à
 * l'écran vaut mieux que de figer le slug et de laisser une adresse mentir.
 */
export async function updateCommunity(
  communityId: string,
  trainerProfileId: string,
  userId: string,
  input: Partial<CommunityInput>,
) {
  const community = await db.community.findUnique({
    where: { id: communityId },
    select: { id: true, trainerId: true, name: true, priceFcfa: true, status: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')
  if (community.trainerId !== trainerProfileId) throw new Error('NOT_OWNER')
  if (community.status !== 'active') throw new Error('COMMUNITY_CLOSED')
  if (!(await canTrainerWrite(trainerProfileId))) throw new Error('SUBSCRIPTION_SUSPENDED')

  assertCommunityInput({
    name: input.name ?? community.name,
    priceFcfa: input.priceFcfa ?? community.priceFcfa,
    description: input.description,
    rules: input.rules,
  })

  const renamed = input.name !== undefined && input.name.trim() !== community.name

  const updated = await db.community.update({
    where: { id: communityId },
    data: {
      ...(input.name !== undefined && {
        name: input.name.trim(),
        ...(renamed ? { slug: await generateCommunitySlug(input.name, communityId) } : {}),
      }),
      ...(input.description !== undefined && { description: input.description?.trim() || null }),
      ...(input.rules !== undefined && { rules: input.rules?.trim() || null }),
      ...(input.priceFcfa !== undefined && { priceFcfa: input.priceFcfa }),
      ...(input.forumEnabled !== undefined && { forumEnabled: input.forumEnabled }),
      ...(input.broadcastEnabled !== undefined && { broadcastEnabled: input.broadcastEnabled }),
      ...(input.messagingEnabled !== undefined && { messagingEnabled: input.messagingEnabled }),
      ...(input.resourcesEnabled !== undefined && { resourcesEnabled: input.resourcesEnabled }),
      ...(input.eventsEnabled !== undefined && { eventsEnabled: input.eventsEnabled }),
    },
  })

  await auditStandalone({
    actorId: userId, actorRole: 'TRAINER',
    action: 'COMMUNITY_UPDATED', targetType: 'Community', targetId: communityId,
    meta: {
      renamed,
      ...(renamed ? { slug: updated.slug } : {}),
      ...(input.priceFcfa !== undefined && input.priceFcfa !== community.priceFcfa
        ? { priceFrom: community.priceFcfa, priceTo: input.priceFcfa }
        : {}),
    },
  })

  return updated
}

// ==========================================================================
// Fermer une communauté — arbitrage 2
// ==========================================================================
// `Community.status` était testé partout en lecture — `updateCommunity`,
// `presignCommunityCover`, l'adhésion — et le renouvellement savait déjà clore
// les adhésions d'une communauté qui n'est plus `active` (`COMMUNITY_CLOSED`).
// Mais **rien n'écrivait jamais autre chose que `active`** : la porte existait,
// personne ne pouvait la pousser.
//
// C'est ce qui bloquait la résiliation d'abonnement : l'arbitrage 2 refuse le
// départ d'un formateur qui a des membres payants actifs, et lui demande de
// fermer sa communauté d'abord. Sans ce geste, la règle était un cul-de-sac.

/**
 * Ferme une communauté : plus aucune adhésion nouvelle, et celles en cours
 * s'éteignent **à leur terme**.
 *
 * Rien n'est coupé sur-le-champ : un membre qui vient de payer son mois le
 * consomme entièrement. C'est `renewDueMemberships` qui referme chaque adhésion
 * à son échéance, avec le motif `COMMUNITY_CLOSED` — il sait déjà le faire.
 *
 * Conséquence à assumer, et que l'écran doit annoncer : le départ complet d'un
 * formateur peut donc prendre jusqu'à un mois.
 */
export async function closeCommunity(
  communityId: string,
  trainerProfileId: string,
  userId: string,
) {
  const community = await db.community.findUnique({
    where: { id: communityId },
    select: { id: true, trainerId: true, status: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')
  if (community.trainerId !== trainerProfileId) throw new Error('NOT_OWNER')
  if (community.status !== 'active') throw new Error('COMMUNITY_ALREADY_CLOSED')

  // Combien de membres payants courent encore : c'est ce délai que le formateur
  // doit attendre avant de pouvoir résilier son abonnement.
  const remaining = await db.communitySubscription.count({
    where: {
      communityId,
      status: { in: ['ACTIVE', 'PAST_DUE'] },
      provider: { not: null },
    },
  })

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.community.update({
      where: { id: communityId },
      data: { status: 'closed' },
    })
    await audit(tx, {
      actorId: userId, actorRole: 'TRAINER',
      action: 'COMMUNITY_CLOSED', targetType: 'Community', targetId: communityId,
      meta: { remainingPaidMembers: remaining },
    })
    return result
  })

  return { community: updated, remainingPaidMembers: remaining }
}

/**
 * Rouvre une communauté fermée. Les adhésions déjà éteintes ne reviennent pas —
 * on ne ressuscite pas une relation payante à laquelle personne n'a consenti —
 * mais les nouvelles redeviennent possibles.
 */
export async function reopenCommunity(
  communityId: string,
  trainerProfileId: string,
  userId: string,
) {
  const community = await db.community.findUnique({
    where: { id: communityId },
    select: { id: true, trainerId: true, status: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')
  if (community.trainerId !== trainerProfileId) throw new Error('NOT_OWNER')
  if (community.status === 'active') throw new Error('COMMUNITY_NOT_CLOSED')
  // Un abonnement suspendu ne rouvre rien : c'est la même logique que le
  // blocage de publication (décision 68).
  if (!(await canTrainerWrite(trainerProfileId))) throw new Error('SUBSCRIPTION_SUSPENDED')

  return db.$transaction(async (tx) => {
    const result = await tx.community.update({
      where: { id: communityId },
      data: { status: 'active' },
    })
    await audit(tx, {
      actorId: userId, actorRole: 'TRAINER',
      action: 'COMMUNITY_REOPENED', targetType: 'Community', targetId: communityId,
    })
    return result
  })
}

/**
 * Les adhésions payantes qui courent encore chez un formateur, toutes
 * communautés confondues. C'est ce que l'arbitrage 2 oppose à une demande de
 * résiliation.
 *
 * **Une adhésion offerte ne compte pas** (`provider` nul) : personne n'y a
 * jamais attaché de moyen de paiement, elle ne représente aucun argent en
 * cours. **Un membre banni non plus** : il n'est déjà plus reconduit.
 */
export async function countActivePaidMembers(trainerProfileId: string): Promise<number> {
  return db.communitySubscription.count({
    where: {
      community: { trainerId: trainerProfileId },
      // `PAST_DUE` compte : l'adhésion court encore, en sursis de règlement.
      status: { in: ['ACTIVE', 'PAST_DUE'] },
      provider: { not: null },
    },
  })
}

// ==========================================================================
// La bannière d'une communauté
// ==========================================================================
// Même chaîne que la couverture d'un cours (`presignCourseUpload` /
// `confirmCourseUpload`) : une URL présignée, puis une confirmation qui est le
// seul endroit où la clé entre en base. Sans cette seconde étape, l'objet
// vivrait sur R2 sans que rien ne le référence.
//
// La taille est relue sur l'objet déposé, jamais reprise du client : c'est elle
// qui alimente le quota de stockage du formateur (arbitrage 54).

/** Miroir de `COURSE_UPLOAD_LIMITS.image` : une bannière est une image. */
export const COMMUNITY_COVER_LIMITS = {
  mimes: ['image/png', 'image/jpeg', 'image/webp'],
  maxSize: 5_242_880,
} as const

/** Préfixe des clés R2 d'une bannière, vérifié à la confirmation. */
const coverPrefix = (communityId: string) => `community-assets/${communityId}/`

export async function presignCommunityCover(
  communityId: string,
  trainerProfileId: string,
  params: { mimeType: string; sizeBytes: number },
) {
  const community = await db.community.findUnique({
    where: { id: communityId },
    select: { id: true, trainerId: true, status: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')
  if (community.trainerId !== trainerProfileId) throw new Error('NOT_OWNER')
  if (community.status !== 'active') throw new Error('COMMUNITY_CLOSED')
  // Décision 68 — le téléversement est un chemin d'écriture, il est bloqué.
  if (!(await canTrainerWrite(trainerProfileId))) throw new Error('SUBSCRIPTION_SUSPENDED')

  if (!(COMMUNITY_COVER_LIMITS.mimes as readonly string[]).includes(params.mimeType)) {
    throw new Error('MIME_NOT_ALLOWED')
  }
  if (params.sizeBytes > COMMUNITY_COVER_LIMITS.maxSize) throw new Error('SIZE_EXCEEDS_LIMIT')

  // La taille annoncée suffit ici : la vérité est reprise à la confirmation,
  // sur l'objet réellement déposé.
  const { remainingBytes } = await trainerStorage(trainerProfileId)
  if (params.sizeBytes > remainingBytes) throw new Error('STORAGE_QUOTA_EXCEEDED')

  const ext = params.mimeType.split('/')[1]
  const s3Key = `${coverPrefix(communityId)}cover-${crypto.randomUUID()}.${ext}`
  const { uploadUrl, expiresAt } = await presignUpload(s3Key, params.mimeType, params.sizeBytes)

  return { uploadUrl, s3Key, expiresAt }
}

export async function confirmCommunityCover(
  communityId: string,
  trainerProfileId: string,
  userId: string,
  params: { s3Key: string; mimeType: string },
) {
  const community = await db.community.findUnique({
    where: { id: communityId },
    select: { id: true, trainerId: true, status: true, coverS3Key: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')
  if (community.trainerId !== trainerProfileId) throw new Error('NOT_OWNER')
  if (community.status !== 'active') throw new Error('COMMUNITY_CLOSED')
  if (!(await canTrainerWrite(trainerProfileId))) throw new Error('SUBSCRIPTION_SUSPENDED')

  // La clé doit être celle que nous avons émise pour CETTE communauté : sinon
  // un formateur pourrait rattacher l'objet d'un autre.
  if (!params.s3Key.startsWith(coverPrefix(communityId))) throw new Error('UPLOAD_NOT_FOUND')

  if (!(COMMUNITY_COVER_LIMITS.mimes as readonly string[]).includes(params.mimeType)) {
    throw new Error('MIME_NOT_ALLOWED')
  }

  // Une image renommée est refusée. Sans identifiants R2, `headObject` renvoie
  // null et la validation est sautée — le mode dev ne dépose rien de réel.
  const head = await headObject(params.s3Key)
  if (head) {
    await validateMagicNumber(params.s3Key, params.mimeType)
    if (head.contentLength > COMMUNITY_COVER_LIMITS.maxSize) throw new Error('SIZE_EXCEEDS_LIMIT')
  }
  const sizeBytes = head?.contentLength ?? 0

  const previousKey = community.coverS3Key
  const updated = await db.community.update({
    where: { id: communityId },
    data: { coverS3Key: params.s3Key, coverSizeBytes: BigInt(sizeBytes) },
    select: { id: true, coverS3Key: true },
  })

  // La bannière remplacée ne sert plus personne et occuperait le quota pour
  // rien : elle est retirée du seau après que la nouvelle clé est en base —
  // dans cet ordre, un échec de suppression ne laisse jamais la communauté
  // pointer sur un objet effacé.
  if (previousKey && previousKey !== params.s3Key) {
    await deleteObject(previousKey).catch(() => {})
  }

  await auditStandalone({
    actorId: userId, actorRole: 'TRAINER',
    action: 'COMMUNITY_COVER_UPLOADED', targetType: 'Community', targetId: communityId,
    meta: { s3Key: params.s3Key, sizeBytes, mimeType: params.mimeType, replaced: Boolean(previousKey) },
  })

  return updated
}

/** La communauté du formateur, avec de quoi remplir son écran de gestion. */
export async function getMyCommunity(trainerProfileId: string) {
  return db.community.findFirst({
    where: { trainerId: trainerProfileId, status: 'active' },
    select: {
      id: true, slug: true, name: true, description: true, rules: true,
      coverS3Key: true,
      priceFcfa: true, visibility: true, membersCount: true, messagesPerDay: true,
      forumEnabled: true, broadcastEnabled: true, messagingEnabled: true,
      resourcesEnabled: true, eventsEnabled: true, createdAt: true,
      _count: {
        select: {
          subscriptions: { where: { status: { in: ['ACTIVE', 'PAST_DUE'] } } },
          courseLinks: { where: { unlinkedAt: null } },
        },
      },
    },
  })
}

// ==========================================================================
// Les membres, vus par l'animateur
// ==========================================================================
// `bannedAt`, `bannedReason` et `bannedById` étaient **lus** par tout le
// produit — `resolveViewer` en tire le silence dans le salon, `blockerFor` le
// refus d'une invitation — et rien ne les écrivait. Le formateur n'avait aucun
// moyen d'écarter quelqu'un de son propre fil.

export interface CommunityMember {
  learnerId: string
  fullName: string | null
  status: string
  periodStart: Date
  periodEnd: Date
  bannedAt: Date | null
  bannedReason: string | null
  canceledAt: Date | null
  /** Entré par une invitation, et laquelle (arbitrage 76). */
  viaInvitation: boolean
  joinedAt: Date
}

export async function listCommunityMembers(
  communityId: string,
  trainerProfileId: string,
): Promise<CommunityMember[]> {
  const community = await db.community.findUnique({
    where: { id: communityId },
    select: { id: true, trainerId: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')
  if (community.trainerId !== trainerProfileId) throw new Error('NOT_OWNER')

  const rows = await db.communitySubscription.findMany({
    where: { communityId },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      learnerId: true, status: true, periodStart: true, periodEnd: true,
      bannedAt: true, bannedReason: true, canceledAt: true, invitationId: true,
      createdAt: true,
      learner: { select: { fullName: true } },
    },
  })

  return rows.map((row) => ({
    learnerId: row.learnerId,
    fullName: row.learner.fullName,
    status: row.status,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    bannedAt: row.bannedAt,
    bannedReason: row.bannedReason,
    canceledAt: row.canceledAt,
    viaInvitation: row.invitationId != null,
    joinedAt: row.createdAt,
  }))
}

/**
 * Bannir, c'est **retirer la parole, pas l'accès** (arbitrage 40).
 *
 * `BANNED` fait partie des statuts « ouverts » : le membre continue de lire le
 * salon et de consulter les ressources incluses jusqu'au terme de la période
 * qu'il a payée. C'est délibéré — lui couper l'accès à ce qu'il a réglé serait
 * une sanction financière déguisée, et c'est exactement ce que le remboursement
 * existe pour traiter. Le même patron que la restriction de compte.
 *
 * Le motif est obligatoire : il est affiché au membre et sert de trace le jour
 * où la décision est contestée.
 */
export async function banCommunityMember(
  communityId: string,
  learnerId: string,
  trainerProfileId: string,
  userId: string,
  reason: string,
) {
  const motive = reason.trim()
  if (motive.length < 10) throw new Error('REASON_REQUIRED')

  const community = await db.community.findUnique({
    where: { id: communityId },
    select: { id: true, trainerId: true, name: true, slug: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')
  if (community.trainerId !== trainerProfileId) throw new Error('NOT_OWNER')

  const subscription = await db.communitySubscription.findFirst({
    where: { communityId, learnerId, status: { in: [...OPEN_STATUSES] } },
    select: { id: true, status: true },
  })
  if (!subscription) throw new Error('MEMBER_NOT_FOUND')
  if (subscription.status === 'BANNED') throw new Error('ALREADY_BANNED')

  await db.$transaction(async (tx) => {
    await tx.communitySubscription.update({
      where: { id: subscription.id },
      data: {
        status: 'BANNED',
        bannedAt: new Date(),
        bannedReason: motive,
        bannedById: userId,
      },
    })
    await audit(tx, {
      actorId: userId, actorRole: 'TRAINER',
      action: 'COMMUNITY_MEMBER_BANNED', targetType: 'CommunitySubscription', targetId: subscription.id,
      meta: { communityId, learnerId, fromStatus: subscription.status, reason: motive },
    })
  })

  // Le membre l'apprend, avec le motif : une exclusion silencieuse se découvre
  // en essayant d'écrire, et se lit comme une panne.
  await deliverSideEffects('COMMUNITY_MEMBER_BANNED', { type: 'CommunitySubscription', id: subscription.id }, () =>
    notify(learnerId, {
      type: 'COMMUNITY_MEMBER_BANNED',
      title: `Vous ne pouvez plus écrire dans ${community.name}`,
      body: `${motive}\n\nVous gardez l'accès en lecture et aux ressources incluses jusqu'au terme de la période déjà réglée.`,
      link: `/mes-communautes/${community.slug}`,
    }),
  )

  return { banned: true }
}

/** Rend la parole. La période, elle, n'a jamais été interrompue. */
export async function unbanCommunityMember(
  communityId: string,
  learnerId: string,
  trainerProfileId: string,
  userId: string,
) {
  const community = await db.community.findUnique({
    where: { id: communityId },
    select: { id: true, trainerId: true, name: true, slug: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')
  if (community.trainerId !== trainerProfileId) throw new Error('NOT_OWNER')

  const subscription = await db.communitySubscription.findFirst({
    where: { communityId, learnerId, status: 'BANNED' },
    select: { id: true, periodEnd: true, canceledAt: true },
  })
  if (!subscription) throw new Error('MEMBER_NOT_BANNED')

  // On ne rend pas `ACTIVE` à quelqu'un dont la période est close ou résiliée :
  // le statut doit refléter la réalité de son adhésion, pas la levée de la
  // sanction. `EXPIRED` est ce que le job de renouvellement aurait posé.
  const expired = subscription.periodEnd < new Date()
  const status = subscription.canceledAt || expired ? 'EXPIRED' : 'ACTIVE'

  await db.$transaction(async (tx) => {
    await tx.communitySubscription.update({
      where: { id: subscription.id },
      data: { status, bannedAt: null, bannedReason: null, bannedById: null },
    })
    await audit(tx, {
      actorId: userId, actorRole: 'TRAINER',
      action: 'COMMUNITY_MEMBER_UNBANNED', targetType: 'CommunitySubscription', targetId: subscription.id,
      meta: { communityId, learnerId, toStatus: status },
    })
  })

  await deliverSideEffects('COMMUNITY_MEMBER_UNBANNED', { type: 'CommunitySubscription', id: subscription.id }, () =>
    notify(learnerId, {
      type: 'COMMUNITY_MEMBER_UNBANNED',
      title: `Vous pouvez de nouveau écrire dans ${community.name}`,
      body: 'La restriction posée sur votre participation a été levée.',
      link: `/mes-communautes/${community.slug}`,
    }),
  )

  return { status }
}

// --- Ressources incluses : liaison et déliaison (formateur) ---

/**
 * Lie une ressource à la communauté du formateur. Bascule son circuit :
 * arbitrage 47, une ressource incluse n'est plus vendue à l'unité.
 */
export async function linkCourseToCommunity(
  communityId: string,
  courseId: string,
  trainerId: string,
  userId: string,
) {
  const [community, course] = await Promise.all([
    db.community.findUnique({ where: { id: communityId }, select: { id: true, trainerId: true } }),
    db.course.findUnique({
      where: { id: courseId },
      select: { id: true, trainerId: true, circuit: true, _count: { select: { purchases: true } } },
    }),
  ])
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')
  if (!course) throw new Error('COURSE_NOT_FOUND')
  if (community.trainerId !== trainerId || course.trainerId !== trainerId) throw new Error('NOT_OWNER')

  // Une ressource déjà vendue ne peut pas basculer : ceux qui l'ont payée
  // l'auraient eue gratuitement en s'abonnant, ce que l'arbitrage 47 exclut.
  if (course._count.purchases > 0) throw new Error('COURSE_ALREADY_SOLD')

  const existing = await db.communityCourse.findFirst({
    where: { communityId, courseId, unlinkedAt: null },
    select: { id: true },
  })
  if (existing) throw new Error('COURSE_ALREADY_LINKED')

  const link = await db.$transaction(async (tx) => {
    const created = await tx.communityCourse.create({ data: { communityId, courseId } })
    await tx.course.update({ where: { id: courseId }, data: { circuit: 'COMMUNITY' } })
    return created
  })

  await auditStandalone({
    actorId: userId, actorRole: 'TRAINER',
    action: 'COMMUNITY_COURSE_LINKED', targetType: 'Community', targetId: communityId,
    meta: { courseId, linkId: link.id },
  })

  return link
}

/**
 * Délie une ressource. La ligne est bornée, pas supprimée : tout membre qui y
 * avait accès pendant la liaison le conserve (arbitrage 48).
 */
export async function unlinkCourseFromCommunity(
  communityId: string,
  courseId: string,
  trainerId: string,
  userId: string,
) {
  const community = await db.community.findUnique({
    where: { id: communityId },
    select: { id: true, trainerId: true },
  })
  if (!community) throw new Error('COMMUNITY_NOT_FOUND')
  if (community.trainerId !== trainerId) throw new Error('NOT_OWNER')

  const { count } = await db.communityCourse.updateMany({
    where: { communityId, courseId, unlinkedAt: null },
    data: { unlinkedAt: new Date() },
  })
  if (count === 0) throw new Error('COURSE_NOT_LINKED')

  // Le circuit revient à la marketplace : la ressource redevient vendable, sans
  // que cela retire quoi que ce soit aux membres qui l'ont déjà.
  await db.course.update({ where: { id: courseId }, data: { circuit: 'MARKETPLACE' } })

  await auditStandalone({
    actorId: userId, actorRole: 'TRAINER',
    action: 'COMMUNITY_COURSE_UNLINKED', targetType: 'Community', targetId: communityId,
    meta: { courseId },
  })
}

// --- Accès d'un membre à une ressource incluse ---

/**
 * Vrai si une période d'adhésion de l'apprenant chevauche une période de
 * liaison de la ressource (arbitrage 48).
 *
 * Les deux bornes ouvertes valent « jusqu'à maintenant » : un abonnement en
 * cours et une liaison en cours se chevauchent forcément.
 */
export async function hasCommunityAccess(learnerId: string, courseId: string): Promise<boolean> {
  const links = await db.communityCourse.findMany({
    where: { courseId },
    select: { communityId: true, linkedAt: true, unlinkedAt: true },
  })
  if (links.length === 0) return false

  const subs = await db.communitySubscription.findMany({
    where: {
      learnerId,
      communityId: { in: links.map((l) => l.communityId) },
    },
    select: { communityId: true, periodStart: true, periodEnd: true, status: true },
  })

  const now = new Date()
  return links.some((link) =>
    subs.some((sub) => {
      if (sub.communityId !== link.communityId) return false
      // Une période encore ouverte court jusqu'à maintenant : sa date de fin
      // sera repoussée au renouvellement, s'y fier fermerait l'accès à tort.
      const subEnd = OPEN_STATUSES.includes(sub.status as never) ? now : sub.periodEnd
      const linkEnd = link.unlinkedAt ?? now
      return sub.periodStart <= linkEnd && link.linkedAt <= subEnd
    }),
  )
}

/** Ressources incluses auxquelles l'apprenant a droit, liées ou non aujourd'hui. */
export async function listMyIncludedCourses(learnerId: string): Promise<CourseListItem[]> {
  const subs = await db.communitySubscription.findMany({
    where: { learnerId },
    select: { communityId: true, periodStart: true, periodEnd: true, status: true },
  })
  if (subs.length === 0) return []

  const links = await db.communityCourse.findMany({
    where: { communityId: { in: subs.map((s) => s.communityId) } },
    select: { communityId: true, linkedAt: true, unlinkedAt: true, course: { select: COURSE_CARD } },
  })

  const now = new Date()
  const seen = new Set<string>()
  const out: CourseListItem[] = []
  for (const link of links) {
    if (seen.has(link.course.id)) continue
    const granted = subs.some((sub) => {
      if (sub.communityId !== link.communityId) return false
      const subEnd = OPEN_STATUSES.includes(sub.status as never) ? now : sub.periodEnd
      const linkEnd = link.unlinkedAt ?? now
      return sub.periodStart <= linkEnd && link.linkedAt <= subEnd
    })
    if (!granted) continue
    seen.add(link.course.id)
    out.push(toCard(link.course))
  }
  return out
}

// --- Projections ---

const SELECT_PUBLIC = {
  id: true, slug: true, name: true, description: true, priceFcfa: true,
  membersCount: true, coverS3Key: true, forumEnabled: true, eventsEnabled: true,
  resourcesEnabled: true,
  trainerProfile: { select: { id: true, slogan: true, user: { select: { fullName: true } } } },
  _count: { select: { courseLinks: { where: { unlinkedAt: null } } } },
} as const

const COURSE_CARD = {
  id: true, slug: true, title: true, blurb: true, category: true, format: true,
  priceFcfa: true, level: true, durationSeconds: true, coverS3Key: true, publishedAt: true,
  trainerProfile: {
    select: {
      id: true, ratingAverage: true, ratingCount: true, studentsCount: true, slogan: true,
      user: { select: { fullName: true } },
    },
  },
} as const

function toPublic(c: any): PublicCommunity {
  return {
    id: c.id, slug: c.slug, name: c.name, description: c.description,
    priceFcfa: c.priceFcfa, membersCount: c.membersCount, coverS3Key: c.coverS3Key,
    forumEnabled: c.forumEnabled, eventsEnabled: c.eventsEnabled,
    resourcesEnabled: c.resourcesEnabled,
    trainer: {
      id: c.trainerProfile.id,
      fullName: c.trainerProfile.user.fullName,
      slogan: c.trainerProfile.slogan,
    },
    includedCount: c._count.courseLinks,
  }
}

function toCard(c: any): CourseListItem {
  return {
    ...c,
    publishedAt: c.publishedAt?.toISOString() ?? null,
    trainerProfile: {
      id: c.trainerProfile.id,
      user: { fullName: c.trainerProfile.user.fullName },
      ratingAverage: c.trainerProfile.ratingAverage,
      ratingCount: c.trainerProfile.ratingCount,
      studentsCount: c.trainerProfile.studentsCount,
      slogan: c.trainerProfile.slogan,
    },
  } as CourseListItem
}
