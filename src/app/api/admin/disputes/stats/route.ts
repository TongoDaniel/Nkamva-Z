// Lot 2 — Modération : statistiques litiges
import { requireAdminSubRole, success } from '@/lib/api'
import { getDisputeStats } from '@/lib/disputes'

export async function GET() {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN', 'FINANCES')
  if (ctx instanceof Response) return ctx

  return success(await getDisputeStats())
}
