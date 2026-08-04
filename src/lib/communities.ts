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

export async function getPublicCommunity(slug: string) {
  const community = await db.community.findFirst({
    where: { slug, status: 'active' },
    select: { ...SELECT_PUBLIC, rules: true, messagesPerDay: true, broadcastEnabled: true },
  })
  if (!community) return null

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
