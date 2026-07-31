// Lot 4 — Achat : réconciliation (polling si webhook tardif)
import { success, error, requireAuth } from '@/lib/api'
import { reconcilePurchase } from '@/lib/purchases'
import { db } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ purchaseId: string }> }) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const { purchaseId } = await params

  // Vérifier que l'achat appartient au user
  const purchase = await db.purchase.findUnique({ where: { id: purchaseId } })
  if (!purchase) return error('PURCHASE_NOT_FOUND', 'Achat introuvable', 404)
  if (purchase.learnerId !== ctx.user.id) return error('FORBIDDEN', 'Non possédé', 403)

  const result = await reconcilePurchase(purchase.providerTransactionId!)
  return success(result)
}
