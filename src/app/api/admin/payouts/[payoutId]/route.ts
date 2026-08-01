// Lot 3 — Finances : détail d'un retrait (avec l'état du portefeuille)
import { requireAdminSubRole, success, errorFromException } from '@/lib/api'
import { getPayoutDetail } from '@/lib/payouts'

export async function GET(_req: Request, { params }: { params: Promise<{ payoutId: string }> }) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { payoutId } = await params

  try {
    return success(await getPayoutDetail(payoutId))
  } catch (err) {
    return errorFromException(err)
  }
}
