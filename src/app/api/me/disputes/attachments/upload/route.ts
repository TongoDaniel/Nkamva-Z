// Lot 2 — Presign R2 pour une pièce jointe de litige (apprenant)
import { z } from 'zod'
import { success, errorFromException, requireAuth, parseBody } from '@/lib/api'
import { presignDisputeAttachmentUpload, DISPUTE_ERRORS } from '@/lib/disputes'

const UploadSchema = z.object({ mimeType: z.string().min(1), sizeBytes: z.number().int().positive() })

export async function POST(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx
  const parsed = await parseBody(request, UploadSchema)
  if (parsed instanceof Response) return parsed

  try {
    const result = await presignDisputeAttachmentUpload(ctx.user.id, parsed.data.mimeType, parsed.data.sizeBytes)
    return success(result, {}, 201)
  } catch (err) {
    return errorFromException(err, DISPUTE_ERRORS)
  }
}
