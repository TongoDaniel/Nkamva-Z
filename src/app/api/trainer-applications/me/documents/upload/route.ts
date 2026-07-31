// Lot 1 — D0 : URL d'envoi présignée pour une pièce du dossier
import { success, error, requireAuth, parseBody } from '@/lib/api'
import { requestDocumentUpload } from '@/lib/trainer-applications'
import { isS3Configured } from '@/lib/s3'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { applicationError } from '../../../errors'
import { z } from 'zod'

const UploadSchema = z.object({
  type: z.enum(['ID_CARD', 'DIPLOMA', 'VIDEO']),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  originalFileName: z.string().trim().max(200).optional(),
})

export async function POST(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const identifier = getRateLimitIdentifier({ id: ctx.user.id }, request)
  const limit = checkRateLimit(identifier, 'trainer-document-upload', RATE_LIMITS.UPLOAD_PRESIGN.max, RATE_LIMITS.UPLOAD_PRESIGN.windowMs)
  if (!limit.allowed) {
    return error('RATE_LIMITED', `Trop d'envois. Réessayez dans ${limit.retryAfter} s.`, 429)
  }

  // Sans identifiants de stockage, presignUpload renvoie une URL factice :
  // l'appelant croirait avoir déposé un fichier qui n'existe nulle part.
  if (!isS3Configured()) {
    return error(
      'STORAGE_NOT_CONFIGURED',
      "Le stockage des pièces n'est pas configuré sur cet environnement.",
      503,
    )
  }

  const parsed = await parseBody(request, UploadSchema)
  if (parsed instanceof Response) return parsed

  try {
    const ticket = await requestDocumentUpload(ctx.user.id, parsed.data)
    return success(ticket, {}, 201)
  } catch (err) {
    return applicationError(err)
  }
}
