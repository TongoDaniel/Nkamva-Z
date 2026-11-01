import { success, requireAuth } from '@/lib/api'
import { listMyMemberships } from '@/lib/memberships'

/**
 * Les communautés de l'utilisateur, pour l'application mobile. Le site les lit
 * côté serveur dans `(app)/mes-communautes/page.tsx` ; même service.
 */
export async function GET() {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx
  return success(await listMyMemberships(ctx.user.id))
}
