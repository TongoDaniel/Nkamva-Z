// Lot 3 — Finances : approuver un retrait (P4)
// Le solde et le moyen de paiement sont re-vérifiés au moment de la décision.
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { approvePayout } from '@/lib/payouts'

const ApproveSchema = z.object({
  note: z.string().max(1000).optional(),
  expectedUpdatedAt: z.string(),
})

export async function POST(request: Request, { params }: { params: Promise<{ payoutId: string }> }) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { payoutId } = await params

  const parsed = await parseBody(request, ApproveSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await approvePayout(payoutId, {
      ...parsed.data, actorId: ctx.user.id, actorRole: ctx.user.adminRole ?? 'FINANCES',
    }))
  } catch (err) {
    return errorFromException(err)
  }
}
