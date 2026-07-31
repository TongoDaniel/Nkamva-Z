// Lot 1 — Admin Modération : 4 cartes du bandeau
import { success, requireAdminSubRole } from '@/lib/api'
import { getApplicationStats } from '@/lib/trainer-applications'

export async function GET() {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  const stats = await getApplicationStats()
  return success(stats)
}
