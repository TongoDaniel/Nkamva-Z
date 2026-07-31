// Lot 3 — Admin Finances/Super-admin : lister les moyens de paiement BLOCKED
import { success, requireAdminSubRole } from '@/lib/api'
import { listEscalations } from '@/lib/payout-methods'

export async function GET(request: Request) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const url = new URL(request.url)
  const page = Number(url.searchParams.get('page') || '1')
  const pageSize = Math.min(Number(url.searchParams.get('pageSize') || '20'), 50)
  const result = await listEscalations(page, pageSize)
  return success(result.items, { page: result.page, pageSize: result.pageSize, total: result.total })
}
