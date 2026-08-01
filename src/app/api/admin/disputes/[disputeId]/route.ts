// Lot 2 — Admin : détail d'un litige
import { success, error, requireAdminSubRole } from '@/lib/api'
import { getDisputeForReview } from '@/lib/dispute-review'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ disputeId: string }> },
) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  const { disputeId } = await params
  const dispute = await getDisputeForReview(disputeId)
  if (!dispute) return error('DISPUTE_NOT_FOUND', 'Dossier introuvable.', 404)
  return success(dispute)
}
