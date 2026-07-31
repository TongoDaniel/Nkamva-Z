// Lot 4 — Mes achats : lister
import { success, requireAuth } from '@/lib/api'
import { listMyPurchases } from '@/lib/purchases'

export async function GET(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const url = new URL(request.url)
  const page = parseInt(url.searchParams.get('page') || '1', 10)
  const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10)

  const result = await listMyPurchases(ctx.user.id, page, pageSize)
  return success(result.items, { total: result.total, page: result.page, pageSize: result.pageSize })
}
