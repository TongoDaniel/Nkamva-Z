// Lot 3 — Finances : statistiques des retraits
import { requireAdminSubRole, success } from '@/lib/api'
import { getPayoutStats } from '@/lib/payouts'

export async function GET() {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  return success(await getPayoutStats())
}
