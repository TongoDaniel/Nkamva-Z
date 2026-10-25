// ==========================================================================
// Recherche transversale — ressources, formateurs, communautés
// ==========================================================================
// Chaque section avait sa propre recherche, aucune ne les traversait. Quelqu'un
// qui cherche « Awa » ne sait pas s'il doit aller au catalogue ou à l'annuaire.
//
// Trois requêtes parallèles plutôt qu'un index plein texte : les volumes sont
// petits, et un `ILIKE` sur trois tables reste franchement plus simple à tenir
// qu'un `tsvector` à maintenir sur des colonnes qui bougent encore.
// ==========================================================================

import { db } from './db'
import { searchAnyOf } from './search-text'
import { userAvatarSrc } from './avatars'
import { PUBLIC_TRAINER_WHERE, rankPublicTrainers } from './trainers'
import type { CourseListItem } from './dto'
import { SEARCH_MIN_LENGTH } from './search-limits'

export { SEARCH_MIN_LENGTH } from './search-limits'
const PER_SECTION = 12

export interface SearchResults {
  query: string
  courses: CourseListItem[]
  trainers: SearchTrainer[]
  communities: SearchCommunity[]
  total: number
}

export interface SearchTrainer {
  id: string
  fullName: string | null
  /** Sa photo de profil, quand il en a déposé une. */
  avatarUrl: string | null
  slogan: string | null
  domains: string[]
  publishedCount: number
}

export interface SearchCommunity {
  id: string
  slug: string
  name: string
  description: string | null
  priceFcfa: number
  membersCount: number
}

export async function searchEverything(rawQuery: string): Promise<SearchResults> {
  const query = rawQuery.trim()
  if (query.length < SEARCH_MIN_LENGTH) {
    return { query, courses: [], trainers: [], communities: [], total: 0 }
  }

  // Jokers échappés, et la forme sans accents cherchée aussi (m6).
  const anyOf = <T,>(fields: (contains: { contains: string; mode: 'insensitive' }) => T[]) =>
    searchAnyOf(query, fields)

  const [courses, trainers, communities] = await Promise.all([
    db.course.findMany({
      where: {
        status: 'published',
        OR: anyOf((contains) => [{ title: contains }, { blurb: contains }, { category: contains }]),
      },
      select: {
        id: true, slug: true, title: true, blurb: true, category: true, format: true,
        priceFcfa: true, level: true, durationSeconds: true, coverS3Key: true, publishedAt: true,
        trainerProfile: {
          select: {
            id: true, ratingAverage: true, ratingCount: true, slogan: true,
            user: { select: { fullName: true } },
          },
        },
      },
      orderBy: { publishedAt: 'desc' },
      take: PER_SECTION,
    }),

    // Mêmes conditions de visibilité que l'annuaire, et par le même objet : un
    // formateur qui n'a pas de fiche atteignable ne doit pas remonter ici, sans
    // quoi la recherche fabriquerait des liens vers des 404. Même ordre aussi,
    // par la même fonction (arbitrage 143).
    rankPublicTrainers({
      filter: {
        OR: [
          ...anyOf((contains) => [{ user: { fullName: contains } }, { slogan: contains }]),
          { domains: { has: query } },
        ],
      },
      limit: PER_SECTION,
    }).then(async ({ ids }) => {
      if (ids.length === 0) return []
      const rows = await db.trainerProfile.findMany({
        where: { AND: [{ id: { in: ids } }, PUBLIC_TRAINER_WHERE] },
        select: {
          id: true, slogan: true, domains: true,
          user: { select: { id: true, fullName: true, avatarS3Key: true, avatarUrl: true } },
          _count: { select: { courses: { where: { status: 'published' } } } },
        },
      })
      const byId = new Map(rows.map((row) => [row.id, row]))
      return ids.flatMap((id) => byId.get(id) ?? [])
    }),

    db.community.findMany({
      where: {
        status: 'active',
        // Arbitrage 81 : la recherche est une surface publique comme une autre.
        // Une communauté privée qui remonterait ici serait fermée de nom
        // seulement.
        visibility: 'PUBLIC',
        OR: anyOf((contains) => [{ name: contains }, { description: contains }]),
      },
      select: {
        id: true, slug: true, name: true, description: true, priceFcfa: true, membersCount: true,
      },
      orderBy: { membersCount: 'desc' },
      take: PER_SECTION,
    }),
  ])

  return {
    query,
    courses: courses.map((c) => ({
      ...c,
      publishedAt: c.publishedAt?.toISOString() ?? null,
      trainerProfile: {
        id: c.trainerProfile.id,
        user: { fullName: c.trainerProfile.user.fullName },
        ratingAverage: c.trainerProfile.ratingAverage,
        ratingCount: c.trainerProfile.ratingCount,
        slogan: c.trainerProfile.slogan,
      },
    })) as CourseListItem[],
    trainers: trainers.map((t) => ({
      id: t.id,
      fullName: t.user.fullName,
      avatarUrl: userAvatarSrc(t.user),
      slogan: t.slogan,
      domains: t.domains,
      publishedCount: t._count.courses,
    })),
    communities,
    total: courses.length + trainers.length + communities.length,
  }
}
