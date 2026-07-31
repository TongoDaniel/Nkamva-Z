// Lot 1 — Admin : liste des candidatures
import { success, requireAdminSubRole, parsePagination } from '@/lib/api'
import { listApplications } from '@/lib/trainer-application-review'
import type { TrainerApplicationStatus } from '@prisma/client'

const STATUSES = ['DRAFT', 'SUBMITTED', 'RESUBMISSION_PENDING', 'APPROVED', 'REJECTED']

export async function GET(request: Request) {
  // Les finances n'ont jamais accès aux dossiers de candidature.
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  const url = new URL(request.url)
  const { page, pageSize } = parsePagination(url.searchParams)
  const rawStatus = url.searchParams.get('status')

  const result = await listApplications({
    status: STATUSES.includes(rawStatus ?? '') ? (rawStatus as TrainerApplicationStatus) : undefined,
    search: url.searchParams.get('search')?.trim() || undefined,
    page,
    pageSize,
  })

  return success(result.items, { total: result.total, page: result.page, pageSize: result.pageSize })
}
