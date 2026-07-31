// Lot 2 — Admin Modération : 4 cartes du bandeau
import { success, requireAdminSubRole } from '@/lib/api'
import { getDisputeStats } from '@/lib/disputes'

export async function GET() {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  return success(await getDisputeStats())
}
