// Lot 4 — Formateur : upload R2 présigné pour contenu de cours
import { success, error, requireTrainer, parseBody, errorFromException } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { presignCourseUpload } from '@/lib/courses'
import { z } from 'zod'

const UploadSchema = z.object({
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  kind: z.enum(['video', 'pdf', 'image', 'archive']),
})

export async function POST(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx

  // Même plafond que les trois autres routes de présignature : une URL signée
  // est un droit d'écriture sur R2, elle ne doit pas s'obtenir en boucle.
  const limit = checkRateLimit(
    getRateLimitIdentifier(ctx.user, request), 'UPLOAD_PRESIGN',
    RATE_LIMITS.UPLOAD_PRESIGN.max, RATE_LIMITS.UPLOAD_PRESIGN.windowMs,
  )
  if (!limit.allowed) return error('RATE_LIMITED', 'Trop de demandes d\'upload, réessayez plus tard', 429)

  const { courseId } = await params
  const parsed = await parseBody(request, UploadSchema)
  if (parsed instanceof Response) return parsed

  try {
    const result = await presignCourseUpload(courseId, ctx.user.trainerId!, parsed.data)
    return success(result, {}, 201)
  } catch (err) {
    // Cette liste écrite à la main oubliait `STORAGE_QUOTA_EXCEEDED` et
    // `SUBSCRIPTION_SUSPENDED`, que `presignCourseUpload` lève pourtant : le
    // formateur à court d'espace lisait « Erreur » en 500 au lieu du motif.
    // `errorFromException` les tire de la table des erreurs de domaine, avec le
    // même code et le même statut que partout ailleurs.
    return errorFromException(err)
  }
}
