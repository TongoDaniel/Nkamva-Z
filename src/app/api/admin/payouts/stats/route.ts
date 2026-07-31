// Lot 3 — Admin Finances : 4 cartes du bandeau
import { success, requireAdminSubRole } from '@/lib/api'
import { getPayoutStats } from '@/lib/payouts'

export async function GET() {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  return success(await getPayoutStats())
}
