// Lot 2 — Admin Finances : lister les tâches de remboursement manuel (CinetPay)
import { success, requireAdminSubRole } from '@/lib/api'
import { listManualRefundTasks } from '@/lib/manual-refund-tasks'

export async function GET(request: Request) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const url = new URL(request.url)
  const status = url.searchParams.get('status') as 'PENDING' | 'COMPLETED' | 'CANCELLED' | null
  const page = Number(url.searchParams.get('page') || '1')
  const pageSize = Math.min(Number(url.searchParams.get('pageSize') || '20'), 50)
  const result = await listManualRefundTasks(status || undefined, page, pageSize)
  return success(result.items, { page: result.page, pageSize: result.pageSize, total: result.total })
}
