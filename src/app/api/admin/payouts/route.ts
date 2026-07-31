// Lot 3 — Admin Finances : lister les retraits (avec KYC badge + wallet summary côté détail)
import { success, requireAdminSubRole } from '@/lib/api'
import { listAdminPayouts } from '@/lib/payouts'

export async function GET(request: Request) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const url = new URL(request.url)
  const status = url.searchParams.get('status') as any
  const page = Number(url.searchParams.get('page') || '1')
  const pageSize = Math.min(Number(url.searchParams.get('pageSize') || '20'), 50)
  const result = await listAdminPayouts(status || undefined, page, pageSize)
  return success(result.items, { page: result.page, pageSize: result.pageSize, total: result.total })
}
