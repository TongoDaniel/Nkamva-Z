// Lot 4 — Mes ressources : lister avec CourseView
import { success, requireAuth } from '@/lib/api'
import { listMyResources } from '@/lib/access'

export async function GET(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const url = new URL(request.url)
  const filter = (url.searchParams.get('filter') || 'all') as 'all' | 'started' | 'unstarted'
  const page = parseInt(url.searchParams.get('page') || '1', 10)
  const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10)

  const result = await listMyResources(ctx.user.id, filter, page, pageSize)
  return success(result.items, { total: result.total, page: result.page, pageSize: result.pageSize })
}
