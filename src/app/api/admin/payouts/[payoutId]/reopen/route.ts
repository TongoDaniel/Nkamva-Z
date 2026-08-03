// Lot 3 — Super-admin : reprendre un retrait en échec (P8)
// Décision 7 — le reopen est réservé au Super-admin, comme la résolution
// d'escalade et la réconciliation de wallet : il remet en vol un montant
// qu'un échec avait libéré.
import { success, requireAdminSubRole, errorFromException } from '@/lib/api'
import { reopenPayout } from '@/lib/payouts'

export async function POST(_request: Request, { params }: { params: Promise<{ payoutId: string }> }) {
  const ctx = await requireAdminSubRole('SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { payoutId } = await params

  try {
    return success(await reopenPayout(payoutId, {
      actorId: ctx.user.id,
      actorRole: ctx.user.adminRole ?? 'SUPER_ADMIN',
    }))
  } catch (err) {
    return errorFromException(err)
  }
}
