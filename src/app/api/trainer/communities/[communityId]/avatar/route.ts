// Formateur — la photo du groupe : présignature, et retrait.
//
// Distincte de la bannière (`../cover`) : l'une est une affiche en 16:9, l'autre
// tient dans un rond en tête d'une liste de conversations.
import { z } from 'zod'
import { success, error, requireTrainer, parseBody, errorFromException } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { presignCommunityAvatar, removeCommunityAvatar } from '@/lib/avatars'

const UploadSchema = z.object({
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ communityId: string }> },
) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx

  const limit = checkRateLimit(
    getRateLimitIdentifier(ctx.user, request), 'UPLOAD_PRESIGN',
    RATE_LIMITS.UPLOAD_PRESIGN.max, RATE_LIMITS.UPLOAD_PRESIGN.windowMs,
  )
  if (!limit.allowed) {
    return error('RATE_LIMITED', "Trop de demandes d'upload, réessayez plus tard", 429)
  }

  const { communityId } = await params
  const parsed = await parseBody(request, UploadSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(
      await presignCommunityAvatar(communityId, ctx.user.trainerId!, parsed.data),
      {},
      201,
    )
  } catch (err) {
    return errorFromException(err)
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ communityId: string }> },
) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const { communityId } = await params
  try {
    return success(await removeCommunityAvatar(communityId, ctx.user.trainerId!, ctx.user.id))
  } catch (err) {
    return errorFromException(err)
  }
}
