// Ma photo de profil — URL présignée pour la déposer, et retrait.
//
// Jumeau de `/api/trainer/communities/[communityId]/cover` : même plafond de
// présignature, une URL signée étant un droit d'écriture sur R2.
import { z } from 'zod'
import { success, error, requireAuth, parseBody, errorFromException } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { presignUserAvatar, removeUserAvatar } from '@/lib/avatars'

const UploadSchema = z.object({
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive(),
})

export async function POST(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const limit = checkRateLimit(
    getRateLimitIdentifier(ctx.user, request), 'UPLOAD_PRESIGN',
    RATE_LIMITS.UPLOAD_PRESIGN.max, RATE_LIMITS.UPLOAD_PRESIGN.windowMs,
  )
  if (!limit.allowed) {
    return error('RATE_LIMITED', "Trop de demandes d'upload, réessayez plus tard", 429)
  }

  const parsed = await parseBody(request, UploadSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await presignUserAvatar(ctx.user.id, parsed.data), {}, 201)
  } catch (err) {
    return errorFromException(err)
  }
}

export async function DELETE() {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx
  try {
    return success(await removeUserAvatar(ctx.user.id))
  } catch (err) {
    return errorFromException(err)
  }
}
