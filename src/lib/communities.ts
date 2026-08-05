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
import { auditStandalone } from './audit'
import { canTrainerWrite } from './subscriptions'
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

/** La communauté du formateur, avec de quoi remplir son écran de gestion. */
export async function getMyCommunity(trainerProfileId: string) {
  return db.community.findFirst({
    where: { trainerId: trainerProfileId, status: 'active' },
    select: {
      id: true, slug: true, name: true, description: true, rules: true,
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
