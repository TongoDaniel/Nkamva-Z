// ==========================================================================
// Lot 4 — Catalogue public : recherche, filtres, tri, pagination
// ==========================================================================

import { db } from './db'
import { searchAnyOf } from './search-text'
import { courseIdsMatching, idsBranch } from './search-unaccent'

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
    where.OR = [
      ...searchAnyOf(params.search, (contains) => [
        { title: contains }, { blurb: contains }, { description: contains },
      ]),
      ...idsBranch(await courseIdsMatching(params.search, ['title', 'blurb', 'description'])),
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

  let orderBy: any = { publishedAt: 'desc' }
  if (params.sort === 'newest') orderBy = { publishedAt: 'desc' }
  else if (params.sort === 'price_asc') orderBy = { priceFcfa: 'asc' }
  else if (params.sort === 'price_desc') orderBy = { priceFcfa: 'desc' }
  // 'popular' : pas de données de ventes agrégées pour l'instant, fallback sur publishedAt

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

  return { items, total, page: params.page, pageSize: params.pageSize }
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
