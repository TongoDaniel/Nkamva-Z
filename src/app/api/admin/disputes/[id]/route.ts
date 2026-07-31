// Lot 2 — Admin Modération : détail d'un litige + fil + pièces jointes
import { success, errorFromException, requireAdminSubRole } from '@/lib/api'
import { getDisputeDetail, DISPUTE_ERRORS } from '@/lib/disputes'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { id } = await params

  try {
    return success(await getDisputeDetail(id))
  } catch (err) {
    return errorFromException(err, DISPUTE_ERRORS)
  }
}
