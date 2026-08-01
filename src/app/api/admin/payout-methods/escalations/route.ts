// Lot 3 — Super-admin : escalades (décision 27)
// Finances ne tranche pas seule un écart de nom : seul le Super-admin, qui a
// accès à l'identité ET au moyen de paiement, peut arbitrer.
import { requireAdminSubRole, success, parsePagination } from '@/lib/api'
import { listEscalations } from '@/lib/payout-methods'

export async function GET(request: Request) {
  const ctx = await requireAdminSubRole('SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  const { page, pageSize } = parsePagination(new URL(request.url))
  const result = await listEscalations(page, pageSize)
  return success(result.items, { total: result.total, page: result.page, pageSize: result.pageSize })
}
