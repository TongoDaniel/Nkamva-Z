// Lot 1 — Modération : file des candidatures
// Décision 7 — Finances n'a AUCUN accès à la validation des formateurs.
import { requireAdminSubRole, success, parsePagination } from '@/lib/api'
import { listApplications } from '@/lib/trainer-applications'
import type { TrainerApplicationStatus } from '@prisma/client'

export async function GET(request: Request) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  const url = new URL(request.url)
  const { page, pageSize } = parsePagination(url)
  const result = await listApplications({
    status: (url.searchParams.get('status') as TrainerApplicationStatus) || undefined,
    page, pageSize,
  })
  return success(result.items, { total: result.total, page: result.page, pageSize: result.pageSize })
}
