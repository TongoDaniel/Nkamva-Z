// Un message d'un salon — répondre, retirer, épingler.
import { z } from 'zod'
import { success, error, requireAuth, parseBody, errorFromException } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { replyToPost, deletePost, togglePinned, POST_MAX_LENGTH } from '@/lib/community-space'

const ReplySchema = z.object({ body: z.string().min(1).max(POST_MAX_LENGTH) }).strict()

type Params = { params: Promise<{ slug: string; postId: string }> }

/** Répondre. La réponse est un POST sur le message, pas une sous-ressource : le
 *  fil n'a qu'un niveau, et il n'y a rien d'autre à y créer. */
export async function POST(request: Request, { params }: Params) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const limit = checkRateLimit(
    getRateLimitIdentifier(ctx.user, request), 'community-reply',
    RATE_LIMITS.DISPUTE_MESSAGE.max, RATE_LIMITS.DISPUTE_MESSAGE.windowMs,
  )
  if (!limit.allowed) return error('RATE_LIMITED', 'Trop de messages, réessayez dans un instant', 429)

  const parsed = await parseBody(request, ReplySchema)
  if (parsed instanceof Response) return parsed

  const { slug, postId } = await params
  try {
    return success(await replyToPost(slug, postId, ctx.user.id, parsed.data), undefined, 201)
  } catch (err) {
    return errorFromException(err)
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const { slug, postId } = await params
  try {
    await deletePost(slug, postId, ctx.user.id)
    return success({ deleted: true })
  } catch (err) {
    return errorFromException(err)
  }
}

/** Épingler ou détacher — réservé à l'animateur. */
export async function PATCH(_request: Request, { params }: Params) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const { slug, postId } = await params
  try {
    return success(await togglePinned(slug, postId, ctx.user.id))
  } catch (err) {
    return errorFromException(err)
  }
}
