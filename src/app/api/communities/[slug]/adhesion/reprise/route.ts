// Revenir sur une résiliation, tant que la période court encore.
//
// Route distincte plutôt qu'un `PATCH { canceled: false }` : se raviser est un
// geste en soi, et il s'audite sous son propre nom.
import { db } from '@/lib/db'
import { success, error, requireAuth, errorFromException } from '@/lib/api'
import { resumeMembership } from '@/lib/memberships'

export async function POST(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const { slug } = await params
  const community = await db.community.findFirst({
    where: { slug, status: 'active' },
    select: { id: true },
  })
  if (!community) return error('COMMUNITY_NOT_FOUND', 'Communauté introuvable', 404)

  try {
    return success(await resumeMembership(community.id, ctx.user.id))
  } catch (err) {
    return errorFromException(err)
  }
}
