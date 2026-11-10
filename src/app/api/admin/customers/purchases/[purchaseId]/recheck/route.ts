// Plan d'action 0.13 : le service client relance le rapprochement d'un achat
// resté en attente. Le fournisseur reste seul juge : rien n'est crédité sans
// sa confirmation.
import { success, requireAdminSubRole, errorFromException } from '@/lib/api'
import { recheckPurchase } from '@/lib/customer-card'

export async function POST(_request: Request, { params }: { params: Promise<{ purchaseId: string }> }) {
  const ctx = await requireAdminSubRole('SUPPORT', 'FINANCES')
  if (ctx instanceof Response) return ctx
  const { purchaseId } = await params
  try {
    return success(await recheckPurchase(purchaseId, ctx.user.id))
  } catch (err) {
    return errorFromException(err)
  }
}
