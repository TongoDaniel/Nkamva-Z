// Lot 2 — Apprenant : consulter un litige et son fil
import { requireAuth, success, errorFromException } from '@/lib/api'
import { getDisputeForLearner } from '@/lib/disputes'

export async function GET(_req: Request, { params }: { params: Promise<{ disputeId: string }> }) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx
  const { disputeId } = await params

  try {
    return success(await getDisputeForLearner(disputeId, ctx.user.id))
  } catch (err) {
    return errorFromException(err)
  }
}
