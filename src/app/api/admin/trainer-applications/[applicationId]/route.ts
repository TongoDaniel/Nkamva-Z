// Lot 1 — Admin : détail d'une candidature
import { success, error, requireAdminSubRole } from '@/lib/api'
import { getApplicationDetail } from '@/lib/trainer-application-review'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  const { applicationId } = await params
  const application = await getApplicationDetail(applicationId)
  if (!application) return error('APPLICATION_NOT_FOUND', 'Candidature introuvable.', 404)

  return success(application)
}
