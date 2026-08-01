// Lot 4 — Mes ressources : lister avec CourseView
import { success, requireAuth, parsePagination } from '@/lib/api'
import { listMyResources } from '@/lib/access'

export async function GET(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const url = new URL(request.url)
  const filter = (url.searchParams.get('filter') || 'all') as 'all' | 'started' | 'unstarted'
  const { page, pageSize } = parsePagination(url)

  const result = await listMyResources(ctx.user.id, filter, page, pageSize)
  return success(result.items, { total: result.total, page: result.page, pageSize: result.pageSize })
}
