// Formateur — URL présignée pour la bannière d'une communauté.
//
// Jumeau de `/api/trainer/courses/[courseId]/upload` : même plafond de
// présignature, une URL signée étant un droit d'écriture sur R2.
import { z } from 'zod'
import { success, error, requireTrainer, parseBody, errorFromException } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { presignCommunityCover } from '@/lib/communities'

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
      await presignCommunityCover(communityId, ctx.user.trainerId!, parsed.data),
      {},
      201,
    )
  } catch (err) {
    return errorFromException(err)
  }
}
