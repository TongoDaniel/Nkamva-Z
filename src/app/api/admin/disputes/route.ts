// Lot 2 — Modération : lister les litiges
import { requireAdminSubRole, success, parsePagination } from '@/lib/api'
import { listDisputes } from '@/lib/disputes'
import type { DisputeStatus } from '@prisma/client'

export async function GET(request: Request) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  const url = new URL(request.url)
  const { page, pageSize } = parsePagination(url)
  const result = await listDisputes({
    status: (url.searchParams.get('status') as DisputeStatus) || undefined,
    source: url.searchParams.get('source') || undefined,
    trainerId: url.searchParams.get('trainerId') || undefined,
    page, pageSize,
  })
  return success(result.items, { total: result.total, page: result.page, pageSize: result.pageSize })
}
