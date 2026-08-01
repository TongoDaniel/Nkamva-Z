// Lot 2 — Finances : file des remboursements à exécuter manuellement (décision 15)
import { requireAdminSubRole, success, parsePagination } from '@/lib/api'
import { listManualRefundTasks } from '@/lib/manual-refund-tasks'

export async function GET(request: Request) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  const url = new URL(request.url)
  const { page, pageSize } = parsePagination(url)
  const result = await listManualRefundTasks({
    status: url.searchParams.get('status') || undefined,
    page, pageSize,
  })
  return success(result.items, { total: result.total, page: result.page, pageSize: result.pageSize })
}
