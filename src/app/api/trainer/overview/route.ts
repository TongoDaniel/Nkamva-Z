import { success, requireTrainer, errorFromException } from '@/lib/api'
import { loadTrainerPanel } from '@/lib/trainer-home'
import { getWithdrawableMethod } from '@/lib/payout-methods'
import { db } from '@/lib/db'
import { IN_FLIGHT_PAYOUT_STATUSES, PAYOUT_MIN_AMOUNT_FCFA } from '@/lib/payouts'

/**
 * Tableau de bord du formateur, pour l'application mobile.
 *
 * Mêmes agrégats que la page `/formateur` (`loadTrainerPanel`) : l'app ne
 * recompte rien, elle ne peut donc pas contredire le site. S'y ajoute l'état
 * du retrait (moyen de paiement prêt, retrait déjà en cours), que le
 * portefeuille du site calcule de son côté au rendu.
 */
export async function GET() {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const trainerId = ctx.user.trainerId!

  try {
    const [panel, withdrawable, inFlight] = await Promise.all([
      loadTrainerPanel(trainerId, ctx.user.id),
      getWithdrawableMethod(trainerId),
      db.payout.count({ where: { trainerId, status: { in: IN_FLIGHT_PAYOUT_STATUSES } } }),
    ])

    const { courses: _courses, sales, ...rest } = panel
    return success({
      ...rest,
      salesByCourse: Array.from(sales.values()),
      payout: {
        minimumFcfa: PAYOUT_MIN_AMOUNT_FCFA,
        inProgress: inFlight > 0,
        /** `null` quand le moyen de paiement permet de retirer. */
        blockedBy: withdrawable.reason,
      },
    })
  } catch (err) {
    return errorFromException(err)
  }
}
