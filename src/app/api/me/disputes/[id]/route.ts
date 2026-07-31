// Lot 2 — Détail d'un litige + fil de conversation (apprenant, le sien)
import { success, error, errorFromException, requireAuth } from '@/lib/api'
import { getDisputeDetail, DISPUTE_ERRORS } from '@/lib/disputes'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx
  const { id } = await params

  try {
    const dispute = await getDisputeDetail(id)
    if (dispute.learnerId !== ctx.user.id) return error('FORBIDDEN', 'Accès refusé', 403)
    return success(dispute)
  } catch (err) {
    return errorFromException(err, DISPUTE_ERRORS)
  }
}
