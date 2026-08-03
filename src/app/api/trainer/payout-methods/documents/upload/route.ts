// Lot 3 — Formateur : URL R2 présignée pour un document d'entreprise (PM0, décision 28)
import { z } from 'zod'
import { success, error, requireTrainer, parseBody, errorFromException } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { presignPayoutMethodDocument, BUSINESS_DOC_MAX_SIZE_BYTES } from '@/lib/payout-methods'

const UploadSchema = z.object({
  kind: z.enum(['BUSINESS_DOC', 'LEGAL_REP_PROOF']),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive().max(BUSINESS_DOC_MAX_SIZE_BYTES),
  sha256: z.string().length(64),
})

export async function POST(request: Request) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx

  const limit = checkRateLimit(
    getRateLimitIdentifier(ctx.user, request), 'UPLOAD_PRESIGN',
    RATE_LIMITS.UPLOAD_PRESIGN.max, RATE_LIMITS.UPLOAD_PRESIGN.windowMs,
  )
  if (!limit.allowed) return error('RATE_LIMITED', 'Trop de demandes d\'upload, réessayez plus tard', 429)

  const parsed = await parseBody(request, UploadSchema)
  if (parsed instanceof Response) return parsed

  try {
    // La clé est émise au nom de l'utilisateur, jamais du profil formateur :
    // c'est lui l'émetteur enregistré sur la `PendingAttachment`.
    return success(await presignPayoutMethodDocument(ctx.user.id, parsed.data), undefined, 201)
  } catch (err) {
    return errorFromException(err)
  }
}
