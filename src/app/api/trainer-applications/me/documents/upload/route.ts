// Lot 1 — D0 : demander une URL présignée pour une pièce (upload initial ou re-soumission)
import { z } from 'zod'
import { success, errorFromException, requireAuth, parseBody } from '@/lib/api'
import { getActiveApplicationForUser, TRAINER_APPLICATION_ERRORS } from '@/lib/trainer-applications'
import { presignDocumentUpload, TRAINER_DOCUMENT_ERRORS } from '@/lib/trainer-documents'

const UploadSchema = z.object({
  type: z.enum(['ID_CARD', 'DIPLOMA', 'VIDEO']),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
})

const ERRORS = { ...TRAINER_APPLICATION_ERRORS, ...TRAINER_DOCUMENT_ERRORS }

export async function POST(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const parsed = await parseBody(request, UploadSchema)
  if (parsed instanceof Response) return parsed

  try {
    const application = await getActiveApplicationForUser(ctx.user.id)
    const result = await presignDocumentUpload(application.id, ctx.user.id, parsed.data.type, parsed.data.mimeType, parsed.data.sizeBytes)
    return success(result, {}, 201)
  } catch (err) {
    return errorFromException(err, ERRORS)
  }
}
