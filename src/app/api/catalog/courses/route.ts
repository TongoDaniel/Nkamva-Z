// Lot 4 — Catalogue public : liste des cours
import { success, parsePagination } from '@/lib/api'
import { searchCourses } from '@/lib/catalog'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const { page, pageSize } = parsePagination(url.searchParams)
  const params = {
    search: url.searchParams.get('search') || undefined,
    category: url.searchParams.get('category') || undefined,
    format: url.searchParams.get('format') || undefined,
    level: url.searchParams.get('level') || undefined,
    minPrice: url.searchParams.get('minPrice') ? parseInt(url.searchParams.get('minPrice')!) : undefined,
    maxPrice: url.searchParams.get('maxPrice') ? parseInt(url.searchParams.get('maxPrice')!) : undefined,
    sort: (url.searchParams.get('sort') || 'newest') as any,
    page,
    pageSize,
  }

  const result = await searchCourses(params)
  return success(result.items, { total: result.total, page: result.page, pageSize: result.pageSize })
}
