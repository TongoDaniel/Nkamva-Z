// Lot 2 — Modération : détail d'un litige (fil, réservations, snapshot, historique)
import { requireAdminSubRole, success, errorFromException } from '@/lib/api'
import { getDisputeForAdmin } from '@/lib/disputes'

export async function GET(_req: Request, { params }: { params: Promise<{ disputeId: string }> }) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { disputeId } = await params

  try {
    return success(await getDisputeForAdmin(disputeId))
  } catch (err) {
    return errorFromException(err)
  }
}
