// Lot 1 — T8 : réouverture d'un dossier refusé
import { success, requireAdminSubRole } from '@/lib/api'
import { reopenApplication } from '@/lib/trainer-application-review'
import { reviewError } from '../../errors'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  // Revenir sur un refus est le seul geste réservé au super-administrateur :
  // il annule la décision d'un pair.
  const ctx = await requireAdminSubRole('SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  const { applicationId } = await params
  try {
    await reopenApplication(applicationId, ctx.user.id)
    return success({ ok: true })
  } catch (err) {
    return reviewError(err)
  }
}
