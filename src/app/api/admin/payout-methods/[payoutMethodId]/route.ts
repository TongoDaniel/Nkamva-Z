// Lot 3 — Finances : détail d'un moyen de paiement
// Le détail expose `verifiedLegalName` (valeur vive) pour la comparaison, mais
// jamais l'image de la pièce d'identité (décision 21).
import { requireAdminSubRole, success, errorFromException } from '@/lib/api'
import { getPayoutMethodDetail } from '@/lib/payout-methods'

export async function GET(_req: Request, { params }: { params: Promise<{ payoutMethodId: string }> }) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { payoutMethodId } = await params

  try {
    return success(await getPayoutMethodDetail(payoutMethodId))
  } catch (err) {
    return errorFromException(err)
  }
}
