// Favoris de l'utilisateur courant — liste et bascule.
import { z } from 'zod'
import { success, error, requireAuth, parseBody, errorFromException } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { listMyFavorites, toggleFavorite } from '@/lib/favorites'

// Exactement une cible. `strict` refuse un corps qui porterait les deux : sans
// lui, la clé en trop serait ignorée en silence et l'appelant croirait avoir
// mis de côté ce qu'il n'a pas demandé.
const ToggleSchema = z
  .object({
    courseId: z.string().uuid().optional(),
    communityId: z.string().uuid().optional(),
  })
  .strict()
  .refine((v) => Boolean(v.courseId) !== Boolean(v.communityId), {
    message: 'Renseignez courseId ou communityId, pas les deux',
  })

export async function GET() {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  return success(await listMyFavorites(ctx.user.id))
}

export async function POST(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  // Un cœur se clique vite et souvent : le plafond est large, il n'est là que
  // pour arrêter une boucle.
  const limit = checkRateLimit(
    getRateLimitIdentifier(ctx.user, request), 'favorite-toggle',
    RATE_LIMITS.DISPUTE_MESSAGE.max, RATE_LIMITS.DISPUTE_MESSAGE.windowMs,
  )
  if (!limit.allowed) return error('RATE_LIMITED', 'Trop de modifications, réessayez dans un instant', 429)

  const parsed = await parseBody(request, ToggleSchema)
  if (parsed instanceof Response) return parsed

  try {
    const target = parsed.data.courseId
      ? { courseId: parsed.data.courseId }
      : { communityId: parsed.data.communityId! }
    return success(await toggleFavorite(ctx.user.id, target))
  } catch (err) {
    return errorFromException(err)
  }
}
