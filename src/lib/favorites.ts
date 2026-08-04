// ==========================================================================
// Favoris — ressources et communautés mises de côté
// ==========================================================================
// Une bascule, pas deux verbes : l'interface n'a qu'un cœur, et deux clics
// rapides ne doivent pas laisser l'utilisateur dans un état qu'il n'a pas
// demandé. L'unicité `(userId, cible)` en base tranche les concurrences.
//
// Aucun audit ici : mettre une ressource de côté n'est pas un acte
// administratif, et journaliser les goûts de quelqu'un n'apporte rien.
// ==========================================================================

import { db } from './db'
import type { CourseListItem } from './dto'

export type FavoriteTarget = { courseId: string } | { communityId: string }

export interface FavoritesView {
  courses: CourseListItem[]
  communities: FavoriteCommunity[]
}

export interface FavoriteCommunity {
  id: string
  slug: string
  name: string
  description: string | null
  priceFcfa: number
  membersCount: number
  coverS3Key: string | null
  trainerName: string | null
}

function where(userId: string, target: FavoriteTarget) {
  return 'courseId' in target
    ? { userId_courseId: { userId, courseId: target.courseId } }
    : { userId_communityId: { userId, communityId: target.communityId } }
}

/**
 * Ajoute ou retire, et renvoie l'état obtenu. La cible est vérifiée avant
 * l'écriture : la contrainte de clé étrangère l'attraperait, mais avec une
 * erreur Prisma opaque là où l'appelant attend un 404 lisible.
 */
export async function toggleFavorite(
  userId: string,
  target: FavoriteTarget,
): Promise<{ favorited: boolean }> {
  const existing = await db.favorite.findUnique({ where: where(userId, target) })

  if (existing) {
    await db.favorite.delete({ where: { id: existing.id } })
    return { favorited: false }
  }

  if ('courseId' in target) {
    const course = await db.course.findFirst({
      where: { id: target.courseId, status: 'published' },
      select: { id: true },
    })
    // Une ressource retirée du catalogue ne peut plus être mise de côté ; celles
    // déjà en favori y restent, l'écran les filtre au rendu.
    if (!course) throw new Error('COURSE_NOT_FOUND')
  } else {
    const community = await db.community.findFirst({
      where: { id: target.communityId, status: 'active' },
      select: { id: true },
    })
    if (!community) throw new Error('COMMUNITY_NOT_FOUND')
  }

  try {
    await db.favorite.create({
      data: {
        userId,
        courseId: 'courseId' in target ? target.courseId : null,
        communityId: 'communityId' in target ? target.communityId : null,
      },
    })
  } catch (err: any) {
    // Deux clics simultanés : l'un crée, l'autre se heurte à l'unicité. Le
    // résultat voulu est atteint, ce n'est pas une erreur pour l'appelant.
    if (err?.code !== 'P2002') throw err
  }

  return { favorited: true }
}

/** Identifiants des ressources en favori, pour préallumer les cœurs d'une liste. */
export async function favoritedCourseIds(userId: string, courseIds: string[]): Promise<Set<string>> {
  if (courseIds.length === 0) return new Set()
  const rows = await db.favorite.findMany({
    where: { userId, courseId: { in: courseIds } },
    select: { courseId: true },
  })
  return new Set(rows.map((r) => r.courseId!).filter(Boolean))
}

export async function countFavorites(userId: string): Promise<number> {
  return db.favorite.count({ where: { userId } })
}

/**
 * Contenu de l'écran des favoris. Les ressources dépubliées et les communautés
 * fermées sont écartées du rendu sans être supprimées : une ressource peut
 * revenir au catalogue, et effacer le favori de quelqu'un sur un simple
 * archivage serait une décision qui ne nous appartient pas.
 */
export async function listMyFavorites(userId: string): Promise<FavoritesView> {
  const rows = await db.favorite.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      course: {
        select: {
          id: true, slug: true, title: true, blurb: true, category: true, format: true,
          priceFcfa: true, level: true, durationSeconds: true, coverS3Key: true,
          publishedAt: true, status: true,
          trainerProfile: {
            select: {
              id: true, ratingAverage: true, ratingCount: true, studentsCount: true, slogan: true,
              user: { select: { fullName: true } },
            },
          },
        },
      },
      community: {
        select: {
          id: true, slug: true, name: true, description: true, priceFcfa: true,
          membersCount: true, coverS3Key: true, status: true,
          trainerProfile: { select: { user: { select: { fullName: true } } } },
        },
      },
    },
    take: 200,
  })

  const courses = rows
    .map((r) => r.course)
    .filter((c): c is NonNullable<typeof c> => Boolean(c) && c!.status === 'published')
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      blurb: c.blurb,
      category: c.category,
      format: c.format,
      priceFcfa: c.priceFcfa,
      level: c.level,
      durationSeconds: c.durationSeconds,
      coverS3Key: c.coverS3Key,
      publishedAt: c.publishedAt?.toISOString() ?? null,
      trainerProfile: {
        id: c.trainerProfile.id,
        user: { fullName: c.trainerProfile.user.fullName },
        ratingAverage: c.trainerProfile.ratingAverage,
        ratingCount: c.trainerProfile.ratingCount,
        studentsCount: c.trainerProfile.studentsCount,
        slogan: c.trainerProfile.slogan,
      },
    })) as CourseListItem[]

  const communities = rows
    .map((r) => r.community)
    .filter((c): c is NonNullable<typeof c> => Boolean(c) && c!.status === 'active')
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      priceFcfa: c.priceFcfa,
      membersCount: c.membersCount,
      coverS3Key: c.coverS3Key,
      trainerName: c.trainerProfile.user.fullName,
    }))

  return { courses, communities }
}
