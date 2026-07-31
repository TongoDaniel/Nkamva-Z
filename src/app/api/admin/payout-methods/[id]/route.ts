// Lot 3 — Admin Finances : détail d'un moyen de paiement + verifiedLegalName (valeur vive)
import { success, errorFromException, requireAdminSubRole } from '@/lib/api'
import { getPayoutMethodDetail, PAYOUT_METHOD_ERRORS } from '@/lib/payout-methods'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { id } = await params

  try {
    return success(await getPayoutMethodDetail(id))
  } catch (err) {
    return errorFromException(err, PAYOUT_METHOD_ERRORS)
  }
}
