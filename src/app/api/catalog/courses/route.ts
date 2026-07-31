// Lot 4 — Catalogue public : liste des cours
import { success } from '@/lib/api'
import { searchCourses } from '@/lib/catalog'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const params = {
    search: url.searchParams.get('search') || undefined,
    category: url.searchParams.get('category') || undefined,
    format: url.searchParams.get('format') || undefined,
    level: url.searchParams.get('level') || undefined,
    minPrice: url.searchParams.get('minPrice') ? parseInt(url.searchParams.get('minPrice')!) : undefined,
    maxPrice: url.searchParams.get('maxPrice') ? parseInt(url.searchParams.get('maxPrice')!) : undefined,
    sort: (url.searchParams.get('sort') || 'newest') as any,
    page: parseInt(url.searchParams.get('page') || '1', 10),
    pageSize: parseInt(url.searchParams.get('pageSize') || '20', 10),
  }

  const result = await searchCourses(params)
  return success(result.items, { total: result.total, page: result.page, pageSize: result.pageSize })
}
