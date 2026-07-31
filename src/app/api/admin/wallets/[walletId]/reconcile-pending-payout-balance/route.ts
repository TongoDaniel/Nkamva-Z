// Lot 3 §6 — Super-admin : réconcilier pendingPayoutBalance sur les Payout en vol
import { success, errorFromException, requireAdminSubRole } from '@/lib/api'
import { reconcilePendingPayoutBalance, WALLET_RECONCILIATION_ERRORS } from '@/lib/wallet-reconciliation'

export async function POST(_request: Request, { params }: { params: Promise<{ walletId: string }> }) {
  const ctx = await requireAdminSubRole('SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { walletId } = await params

  try {
    return success(await reconcilePendingPayoutBalance(walletId, ctx.user.id))
  } catch (err) {
    return errorFromException(err, WALLET_RECONCILIATION_ERRORS)
  }
}
