// Lot 3 — Super-admin : corriger un écart sur `pendingPayoutBalance`
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { reconcileWalletField } from '@/lib/wallet-reconciliation'

const ReconcileSchema = z.object({
  reason: z.string().min(10).max(1000),
})

export async function POST(request: Request, { params }: { params: Promise<{ walletId: string }> }) {
  const ctx = await requireAdminSubRole('SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { walletId } = await params

  const parsed = await parseBody(request, ReconcileSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await reconcileWalletField(walletId, 'pendingPayoutBalance', {
      actorId: ctx.user.id, reason: parsed.data.reason,
    }))
  } catch (err) {
    return errorFromException(err)
  }
}
