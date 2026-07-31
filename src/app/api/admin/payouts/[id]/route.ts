// Lot 3 — Admin Finances : détail d'un retrait (KYC + wallet + méthode)
import { success, errorFromException, requireAdminSubRole } from '@/lib/api'
import { getPayoutDetail, PAYOUT_ERRORS } from '@/lib/payouts'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { id } = await params

  try {
    return success(await getPayoutDetail(id))
  } catch (err) {
    return errorFromException(err, PAYOUT_ERRORS)
  }
}
