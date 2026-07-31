// Lot 1 — Admin : compteurs de la file de revue
import { success, requireAdminSubRole } from '@/lib/api'
import { getApplicationStats } from '@/lib/trainer-application-review'

export async function GET() {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  return success(await getApplicationStats())
}
