// Lot 1 — Demander une URL R2 présignée pour une pièce justificative (D0/D4)
import { z } from 'zod'
import { success, error, requireAuth, parseBody, errorFromException } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { requestDocumentUpload } from '@/lib/trainer-documents'

const UploadSchema = z.object({
  type: z.enum(['ID_CARD', 'DIPLOMA', 'VIDEO']),
  mimeType: z.string().max(100),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().length(64),
  originalFileName: z.string().max(255).optional(),
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
    return success(await requestDocumentUpload(ctx.user.id, parsed.data), undefined, 201)
  } catch (err) {
    return errorFromException(err)
  }
}
