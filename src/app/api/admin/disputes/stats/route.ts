// Lot 2 — Admin : compteurs de la file des litiges
import { success, requireAdminSubRole } from '@/lib/api'
import { getDisputeStats } from '@/lib/dispute-review'

export async function GET() {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  return success(await getDisputeStats())
}
