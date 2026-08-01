// Lot 3 — Finances : constater le versement (P6)
// C'est ici, et seulement ici, que `Wallet.balance` est réellement débité.
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { markPayoutPaid } from '@/lib/payouts'

const MarkPaidSchema = z.object({
  providerReference: z.string().max(255).optional(),
  receiptS3Key: z.string().max(500).optional(),
})

export async function POST(request: Request, { params }: { params: Promise<{ payoutId: string }> }) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { payoutId } = await params

  const parsed = await parseBody(request, MarkPaidSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await markPayoutPaid(payoutId, {
      ...parsed.data, actorId: ctx.user.id, actorRole: ctx.user.adminRole ?? 'FINANCES',
    }))
  } catch (err) {
    return errorFromException(err)
  }
}
