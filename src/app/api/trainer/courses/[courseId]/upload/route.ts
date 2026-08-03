// Lot 4 — Formateur : upload R2 présigné pour contenu de cours
import { success, error, requireTrainer, parseBody } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { presignCourseUpload } from '@/lib/courses'
import { z } from 'zod'

const UploadSchema = z.object({
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  kind: z.enum(['video', 'pdf', 'image']),
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
  } catch (err: any) {
    if (err.message === 'COURSE_NOT_FOUND') return error('COURSE_NOT_FOUND', 'Cours introuvable', 404)
    if (err.message === 'NOT_OWNER') return error('NOT_OWNER', 'Non possédé', 403)
    if (err.message === 'MIME_NOT_ALLOWED') return error('MIME_NOT_ALLOWED', 'Type MIME non autorisé', 400)
    if (err.message === 'SIZE_EXCEEDS_LIMIT') return error('SIZE_EXCEEDS_LIMIT', 'Taille dépassée', 400)
    return error('INTERNAL_ERROR', 'Erreur', 500)
  }
}
