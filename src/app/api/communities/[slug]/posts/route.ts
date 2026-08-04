// Salons d'une communauté — lire les deux fils, y écrire.
import { z } from 'zod'
import { success, error, requireAuth, parseBody, errorFromException } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { getCommunitySpace, createPost, POST_MAX_LENGTH } from '@/lib/community-space'

const PostSchema = z
  .object({
    kind: z.enum(['ANNOUNCEMENT', 'DISCUSSION']),
    body: z.string().min(1).max(POST_MAX_LENGTH),
  })
  .strict()

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const { slug } = await params
  try {
    return success(await getCommunitySpace(slug, ctx.user.id))
  } catch (err) {
    return errorFromException(err)
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  // Même plafond que les messages de litige : écrire souvent est normal,
  // inonder un salon ne l'est pas.
  const limit = checkRateLimit(
    getRateLimitIdentifier(ctx.user, request), 'community-post',
    RATE_LIMITS.DISPUTE_MESSAGE.max, RATE_LIMITS.DISPUTE_MESSAGE.windowMs,
  )
  if (!limit.allowed) return error('RATE_LIMITED', 'Trop de messages, réessayez dans un instant', 429)

  const parsed = await parseBody(request, PostSchema)
  if (parsed instanceof Response) return parsed

  const { slug } = await params
  try {
    return success(await createPost(slug, ctx.user.id, parsed.data), undefined, 201)
  } catch (err) {
    return errorFromException(err)
  }
}
