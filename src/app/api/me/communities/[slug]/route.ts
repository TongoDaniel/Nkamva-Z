import { success, error, requireAuth, errorFromException } from '@/lib/api'
import { getCommunitySpace } from '@/lib/community-space'
import { getPublicCommunity } from '@/lib/communities'
import { listCommunityLives } from '@/lib/lives'
import { getMembership } from '@/lib/memberships'
import { db } from '@/lib/db'

/**
 * L'espace d'une communauté, pour l'application mobile : ce que la page
 * `(app)/mes-communautes/[slug]` assemble côté serveur, avec les mêmes
 * services et donc les mêmes règles d'accès (`getCommunitySpace` refuse qui
 * n'est pas membre).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx
  const { slug } = await params

  try {
    const space = await getCommunitySpace(slug, ctx.user.id)
    const [included, lives, membership, group] = await Promise.all([
      space.resourcesEnabled ? getPublicCommunity(slug, ctx.user.id) : null,
      space.eventsEnabled ? listCommunityLives(space.communityId, space.isTrainer) : { sessions: [], replays: [] },
      space.isTrainer ? null : getMembership(space.communityId, ctx.user.id),
      // Lecture seule : le groupe naît avec la communauté (`ensureCommunityGroup`),
      // cette route ne doit rien créer.
      space.forumEnabled
        ? db.conversation.findFirst({ where: { communityId: space.communityId, kind: 'GROUP' }, select: { id: true } })
        : null,
    ])
    return success({
      ...space,
      description: included?.description ?? null,
      courses: included?.courses ?? [],
      sessions: lives.sessions,
      replaysCount: lives.replays.length,
      membership,
      groupConversationId: group?.id ?? null,
    })
  } catch (err) {
    const code = err instanceof Error ? err.message : ''
    if (code === 'NOT_MEMBER') return error('NOT_MEMBER', 'Tu n’es pas membre de cette communauté.', 403)
    if (code === 'COMMUNITY_NOT_FOUND') return error('COMMUNITY_NOT_FOUND', 'Communauté introuvable.', 404)
    return errorFromException(err)
  }
}
