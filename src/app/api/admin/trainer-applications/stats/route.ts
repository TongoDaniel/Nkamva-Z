// Lot 1 — Modération : statistiques des candidatures
import { requireAdminSubRole, success } from '@/lib/api'
import { getApplicationStats } from '@/lib/trainer-applications'

export async function GET() {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  return success(await getApplicationStats())
}
