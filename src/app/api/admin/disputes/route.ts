// Lot 2 — Admin : file des litiges
import { success, requireAdminSubRole, parsePagination } from '@/lib/api'
import { listDisputes } from '@/lib/dispute-review'
import type { DisputeStatus } from '@prisma/client'

const STATUSES = ['OPEN', 'IN_REVIEW', 'WAITING_LEARNER', 'RESOLVED_REFUNDED', 'RESOLVED_REJECTED', 'RESOLVED_AUTO']

export async function GET(request: Request) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  const url = new URL(request.url)
  const { page, pageSize } = parsePagination(url.searchParams)
  const raw = url.searchParams.get('status')
  const result = await listDisputes({
    status: STATUSES.includes(raw ?? '') ? (raw as DisputeStatus) : undefined,
    page,
    pageSize,
  })
  return success(result.items, { total: result.total, page: result.page, pageSize: result.pageSize })
}
