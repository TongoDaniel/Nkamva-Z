// Lot 1 — Admin Modération : détail d'une candidature + downloadUrl par document
import { success, errorFromException, requireAdminSubRole } from '@/lib/api'
import { getApplicationDetail, TRAINER_APPLICATION_ERRORS } from '@/lib/trainer-applications'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { id } = await params

  try {
    const application = await getApplicationDetail(id)
    return success(application)
  } catch (err) {
    return errorFromException(err, TRAINER_APPLICATION_ERRORS)
  }
}
