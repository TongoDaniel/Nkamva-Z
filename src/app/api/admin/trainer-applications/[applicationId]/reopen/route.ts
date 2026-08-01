// Lot 1 — Super-admin : rouvrir une candidature rejetée (T8)
// Réservé au Super-admin : c'est une annulation de décision de modération.
import { success, requireAdminSubRole, errorFromException } from '@/lib/api'
import { reopenApplication } from '@/lib/trainer-applications'

export async function POST(_req: Request, { params }: { params: Promise<{ applicationId: string }> }) {
  const ctx = await requireAdminSubRole('SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { applicationId } = await params

  try {
    return success(await reopenApplication(applicationId, ctx.user.id))
  } catch (err) {
    return errorFromException(err)
  }
}
