// Lot 3 — Détail d'un retrait (le sien)
import { success, error, errorFromException, requireTrainer } from '@/lib/api'
import { getPayoutDetail, PAYOUT_ERRORS } from '@/lib/payouts'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const { id } = await params

  try {
    const payout = await getPayoutDetail(id)
    if (payout.trainerId !== ctx.user.trainerId) return error('FORBIDDEN', 'Accès refusé', 403)
    return success(payout)
  } catch (err) {
    return errorFromException(err, PAYOUT_ERRORS)
  }
}
