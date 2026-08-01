// Lot 2 — Apprenant : URL R2 présignée pour une pièce jointe de litige
import { z } from 'zod'
import { success, error, requireAuth, parseBody, errorFromException } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { presignDisputeAttachment, ATTACHMENT_MAX_SIZE_BYTES } from '@/lib/disputes'

const UploadSchema = z.object({
  mimeType: z.string(),
  sizeBytes: z.number().int().positive().max(ATTACHMENT_MAX_SIZE_BYTES),
  sha256: z.string().length(64),
  disputeId: z.string().uuid().optional(),
})

export async function POST(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const limit = checkRateLimit(
    getRateLimitIdentifier(ctx.user, request), 'UPLOAD_PRESIGN',
    RATE_LIMITS.UPLOAD_PRESIGN.max, RATE_LIMITS.UPLOAD_PRESIGN.windowMs,
  )
  if (!limit.allowed) return error('RATE_LIMITED', 'Trop de demandes d\'upload, réessayez plus tard', 429)

  const parsed = await parseBody(request, UploadSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await presignDisputeAttachment(ctx.user.id, parsed.data), undefined, 201)
  } catch (err) {
    return errorFromException(err)
  }
}
