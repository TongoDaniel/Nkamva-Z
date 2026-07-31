// Lot 1 — Admin Modération : lister les candidatures
import { success, requireAdminSubRole } from '@/lib/api'
import { listApplications } from '@/lib/trainer-applications'

export async function GET(request: Request) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  const url = new URL(request.url)
  const queue = (url.searchParams.get('queue') || 'pending') as 'pending' | 'approved' | 'rejected'
  const page = Number(url.searchParams.get('page') || '1')
  const pageSize = Math.min(Number(url.searchParams.get('pageSize') || '20'), 50)

  const result = await listApplications(queue, page, pageSize)
  return success(result.items, { page: result.page, pageSize: result.pageSize, total: result.total })
}
