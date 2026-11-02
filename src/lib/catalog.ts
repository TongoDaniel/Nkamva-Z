// ==========================================================================
// Lot 4 — Catalogue public : recherche, filtres, tri, pagination
// ==========================================================================

import { db } from './db'
import { searchAnyOf } from './search-text'
import { courseIdsMatching, idsBranch, trainerProfileIdsMatching } from './search-unaccent'

/** Fenêtre et seuil du tri « popular » : ceux de la tendance (`trending.ts`). */
const POPULAR_WINDOW_DAYS = 30
const POPULAR_MIN_RANKED = 3

export interface CatalogQuery {
  search?: string
  category?: string
  format?: string
  level?: string
  minPrice?: number
  maxPrice?: number
  sort?: 'popular' | 'newest' | 'price_asc' | 'price_desc'
  page: number
  pageSize: number
}

/**
 * Ce qu'une carte de ressource lit en base. Exporté pour que les rangées de
 * l'accueil (`lib/trending.ts`) rendent exactement la même carte que le
 * catalogue : deux `select` recopiés auraient divergé au premier champ ajouté.
 */
export const COURSE_LIST_SELECT = {
  id: true, slug: true, title: true, blurb: true,
  category: true, format: true, priceFcfa: true, level: true,
  durationSeconds: true, publishedAt: true,
  coverS3Key: true,
  trainerProfile: {
    select: {
      id: true,
      user: { select: { fullName: true } },
      ratingAverage: true, ratingCount: true,
    },
  },
} as const

export async function searchCourses(params: CatalogQuery) {
  const where: any = {
    status: 'published',
    // Arbitrage 47 — une ressource incluse dans une communauté n'est pas vendue
    // à l'unité : elle n'a rien à faire au catalogue marchand.
    circuit: 'MARKETPLACE',
  }

  if (params.search?.trim()) {
    // Jokers échappés, la forme sans accents cherchée aussi, et le texte stocké
    // comparé sans ses accents : « robe » trouve « rôbe » (m6).
    //
    // Le nom du formateur et le thème comptent aussi : le champ de recherche
    // annonce « une compétence, un formateur », et taper le nom d'un formateur
    // ne trouvait rien.
    const [courseIds, trainerIds] = await Promise.all([
      courseIdsMatching(params.search, ['title', 'blurb', 'description', 'category']),
      trainerProfileIdsMatching(params.search),
    ])
    where.OR = [
      ...searchAnyOf(params.search, (contains) => [
        { title: contains }, { blurb: contains }, { description: contains }, { category: contains },
        { trainerProfile: { user: { fullName: contains } } },
      ]),
      ...idsBranch(courseIds),
      ...(trainerIds.length > 0 ? [{ trainerId: { in: trainerIds } }] : []),
    ]
  }
  if (params.category) where.category = params.category
  if (params.format) where.format = params.format
  if (params.level) where.level = params.level
  if (params.minPrice !== undefined || params.maxPrice !== undefined) {
    where.priceFcfa = {}
    if (params.minPrice !== undefined) where.priceFcfa.gte = params.minPrice
    if (params.maxPrice !== undefined) where.priceFcfa.lte = params.maxPrice
  }

  if (params.sort === 'popular') {
    const popular = await searchPopular(where, params)
    if (popular) return popular
  }

  let orderBy: any = { publishedAt: 'desc' }
  if (params.sort === 'price_asc') orderBy = { priceFcfa: 'asc' }
  else if (params.sort === 'price_desc') orderBy = { priceFcfa: 'desc' }

  const [items, total] = await Promise.all([
    db.course.findMany({
      where,
      select: COURSE_LIST_SELECT,
      orderBy,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    db.course.count({ where }),
  ])

  return { items, total, page: params.page, pageSize: params.pageSize, ranked: false }
}

/**
 * Tri « popular » : les achats aboutis et non remboursés des 30 derniers jours,
 * la définition de la tendance (arbitrage 142). Les ressources classées
 * viennent d'abord, les autres suivent par date de publication, et la
 * pagination traverse les deux.
 *
 * `null` quand trop peu de ressources se sont vendues pour classer : on ne
 * prétend pas classer, l'appelant retombe sur les nouveautés et le dit
 * (`ranked: false`).
 */
async function searchPopular(where: any, params: CatalogQuery) {
  const since = new Date(Date.now() - POPULAR_WINDOW_DAYS * 86_400_000)
  const counts = await db.purchase.groupBy({
    by: ['courseId'],
    where: {
      courseId: { not: null },
      providerStatus: 'SUCCEEDED',
      refundedAt: null,
      createdAt: { gte: since },
      course: { is: where },
    },
    _count: { _all: true },
    orderBy: [{ _count: { courseId: 'desc' } }, { courseId: 'asc' }],
  })
  const ranked = counts.map((c) => c.courseId).filter((id): id is string => !!id)
  if (ranked.length < POPULAR_MIN_RANKED) return null

  const start = (params.page - 1) * params.pageSize
  const end = start + params.pageSize
  const head = ranked.slice(start, end)
  const tailSkip = Math.max(0, start - ranked.length)
  const tailTake = end - Math.max(start, ranked.length)

  const [headRows, tailRows, total] = await Promise.all([
    head.length ? db.course.findMany({ where: { id: { in: head } }, select: COURSE_LIST_SELECT }) : [],
    tailTake > 0
      ? db.course.findMany({
          where: { AND: [where, { id: { notIn: ranked } }] },
          select: COURSE_LIST_SELECT,
          orderBy: { publishedAt: 'desc' },
          skip: tailSkip,
          take: tailTake,
        })
      : [],
    db.course.count({ where }),
  ])
  const byId = new Map(headRows.map((row) => [row.id, row] as const))
  const items = [...head.flatMap((id) => byId.get(id) ?? []), ...tailRows]
  return { items, total, page: params.page, pageSize: params.pageSize, ranked: true }
}

export interface CatalogFacet {
  value: string
  count: number
}

/**
 * Ce que les filtres du catalogue peuvent proposer, avec le nombre de
 * ressources derrière chaque choix : un filtre qui mènerait à une liste vide
 * n'est pas proposé. Le catalogue marchand seul, comme `searchCourses`.
 */
export async function getCatalogFacets(): Promise<{ categories: CatalogFacet[]; formats: CatalogFacet[]; levels: CatalogFacet[] }> {
  const where = { status: 'published', circuit: 'MARKETPLACE' as const }
  const [categories, formats, levels] = await Promise.all([
    db.course.groupBy({ by: ['category'], where, _count: { _all: true } }),
    db.course.groupBy({ by: ['format'], where, _count: { _all: true } }),
    db.course.groupBy({ by: ['level'], where: { ...where, level: { not: null } }, _count: { _all: true } }),
  ])
  const facets = (rows: { value: string | null; count: number }[]): CatalogFacet[] =>
    rows
      .filter((r): r is CatalogFacet => !!r.value)
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'fr'))
  return {
    categories: facets(categories.map((r) => ({ value: r.category, count: r._count._all }))),
    formats: facets(formats.map((r) => ({ value: r.format, count: r._count._all }))),
    levels: facets(levels.map((r) => ({ value: r.level, count: r._count._all }))),
  }
}

export async function getPublicCourse(slug: string) {
  const course = await db.course.findUnique({
    where: { slug },
    include: {
      trainerProfile: {
        select: {
          id: true,
          // `bio` vit sur User, pas sur TrainerProfile : la sélectionner ici
          // faisait échouer la requête Prisma. La présentation publique du
          // formateur est `TrainerProfile.description`, avec `User.bio` en repli.
          user: { select: { id: true, fullName: true, bio: true } },
          ratingAverage: true, ratingCount: true,
          slogan: true, description: true,
        },
      },
    },
  })

  if (!course || course.status !== 'published') return null

  return course
}

export async function getCategories() {
  const categories = await db.course.findMany({
    where: { status: 'published' },
    select: { category: true },
    distinct: ['category'],
  })
  return categories.map(c => c.category).filter(Boolean)
}

export async function getFormats() {
  const formats = await db.course.findMany({
    where: { status: 'published' },
    select: { format: true },
    distinct: ['format'],
  })
  return formats.map(f => f.format).filter(Boolean)
}
