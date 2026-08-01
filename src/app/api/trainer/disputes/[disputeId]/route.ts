// Lot 2 — Détail d'un litige, vu par le formateur
import { success, error, requireTrainer } from '@/lib/api'
import { getTrainerDispute } from '@/lib/trainer-disputes'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ disputeId: string }> },
) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx

  const { disputeId } = await params
  const dispute = await getTrainerDispute(disputeId, ctx.user.trainerId!)
  if (!dispute) return error('DISPUTE_NOT_FOUND', 'Litige introuvable.', 404)

  return success(dispute)
}
