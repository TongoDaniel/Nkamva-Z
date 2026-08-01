// Lot 1 — Modération : détail d'une candidature (pièces + historique)
import { requireAdminSubRole, success, errorFromException } from '@/lib/api'
import { getApplicationDetail } from '@/lib/trainer-applications'

export async function GET(_req: Request, { params }: { params: Promise<{ applicationId: string }> }) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { applicationId } = await params

  try {
    return success(await getApplicationDetail(applicationId))
  } catch (err) {
    return errorFromException(err)
  }
}
