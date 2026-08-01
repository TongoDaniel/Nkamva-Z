// Lot 2 — Détail d'une de mes contestations
import { success, error, requireAuth } from '@/lib/api'
import { getMyDispute } from '@/lib/disputes'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ disputeId: string }> },
) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const { disputeId } = await params
  const dispute = await getMyDispute(disputeId, ctx.user.id)
  if (!dispute) return error('DISPUTE_NOT_FOUND', 'Contestation introuvable.', 404)

  return success(dispute)
}
