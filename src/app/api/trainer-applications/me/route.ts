// Lot 1 — Consulter sa propre candidature
import { success, error, requireAuth } from '@/lib/api'
import { getMyApplication } from '@/lib/trainer-applications'

export async function GET() {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const application = await getMyApplication(ctx.user.id)
  if (!application) return error('APPLICATION_NOT_FOUND', 'Aucune candidature', 404)
  return success(application)
}
