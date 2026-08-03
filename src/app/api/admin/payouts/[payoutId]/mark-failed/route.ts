// Lot 3 — Finances : constater l'échec d'un versement (P7)
// L'engagement retombe, `Wallet.balance` reste intact : le virement n'a pas eu
// lieu, le formateur n'a rien perdu. Symétrique de mark-paid, qui débite.
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { markPayoutFailed } from '@/lib/payouts'

const MarkFailedSchema = z.object({
  // Le motif est repris dans la notification au formateur : il doit être
  // exploitable, pas un code de rejet bancaire brut.
  reason: z.string().min(10).max(1000),
})

export async function POST(request: Request, { params }: { params: Promise<{ payoutId: string }> }) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { payoutId } = await params

  const parsed = await parseBody(request, MarkFailedSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await markPayoutFailed(payoutId, {
      ...parsed.data,
      actorId: ctx.user.id,
      actorRole: ctx.user.adminRole ?? 'FINANCES',
    }))
  } catch (err) {
    return errorFromException(err)
  }
}
