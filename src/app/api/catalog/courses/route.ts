// Lot 4 — Catalogue public : liste des cours
import { success, parsePagination } from '@/lib/api'
import { searchCourses } from '@/lib/catalog'
import { intParam } from '@/lib/search-text'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const { page, pageSize } = parsePagination(url)
  const params = {
    search: url.searchParams.get('search') || undefined,
    category: url.searchParams.get('category') || undefined,
    format: url.searchParams.get('format') || undefined,
    level: url.searchParams.get('level') || undefined,
    // Un prix illisible est ignoré : `parseInt('abc')` donnait NaN, et la
    // requête rendait une erreur 500 (m6).
    minPrice: intParam(url.searchParams.get('minPrice')),
    maxPrice: intParam(url.searchParams.get('maxPrice')),
    sort: (url.searchParams.get('sort') || 'newest') as any,
    page,
    pageSize,
  }

  const result = await searchCourses(params)
  return success(result.items, { total: result.total, page: result.page, pageSize: result.pageSize })
}
