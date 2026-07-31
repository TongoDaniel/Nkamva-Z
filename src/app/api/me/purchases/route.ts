// Lot 4 — Mes achats : lister
import { success, requireAuth, parsePagination } from '@/lib/api'
import { listMyPurchases } from '@/lib/purchases'

export async function GET(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const url = new URL(request.url)
  const { page, pageSize } = parsePagination(url.searchParams)

  const result = await listMyPurchases(ctx.user.id, page, pageSize)
  return success(result.items, { total: result.total, page: result.page, pageSize: result.pageSize })
}
