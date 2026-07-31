// ==========================================================================
// Lot 4 — Catalogue public : recherche, filtres, tri, pagination
// ==========================================================================

import { db } from './db'

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

export async function searchCourses(params: CatalogQuery) {
  const where: any = {
    status: 'published',
  }

  if (params.search) {
    where.OR = [
      { title: { contains: params.search, mode: 'insensitive' } },
      { blurb: { contains: params.search, mode: 'insensitive' } },
      { description: { contains: params.search, mode: 'insensitive' } },
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
      select: {
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
      },
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
          user: { select: { id: true, fullName: true } },
          ratingAverage: true, ratingCount: true, studentsCount: true,
          bio: true,
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
