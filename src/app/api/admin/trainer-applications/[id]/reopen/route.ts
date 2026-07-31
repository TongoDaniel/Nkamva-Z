// Lot 1 — T8 : réouverture (Super-admin uniquement)
import { success, errorFromException, requireAdminSubRole } from '@/lib/api'
import { reopenApplication, TRAINER_APPLICATION_ERRORS } from '@/lib/trainer-applications'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminSubRole('SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { id } = await params

  try {
    await reopenApplication(id, ctx.user.id)
    return success({ reopened: true })
  } catch (err) {
    return errorFromException(err, TRAINER_APPLICATION_ERRORS)
  }
}
