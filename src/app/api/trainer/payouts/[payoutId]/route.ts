// Lot 3 — Formateur : détail d'un de ses retraits
import { success, requireTrainer, errorFromException } from '@/lib/api'
import { getPayoutForTrainer } from '@/lib/payouts'

export async function GET(_req: Request, { params }: { params: Promise<{ payoutId: string }> }) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const { payoutId } = await params

  try {
    return success(await getPayoutForTrainer(payoutId, ctx.user.trainerId!))
  } catch (err) {
    return errorFromException(err)
  }
}
