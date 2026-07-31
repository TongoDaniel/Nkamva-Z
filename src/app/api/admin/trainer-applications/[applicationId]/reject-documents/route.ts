// Lot 1 — T4 : refus de pièces, le dossier repart chez le candidat
import { success, requireAdminSubRole, parseBody } from '@/lib/api'
import { rejectDocuments } from '@/lib/trainer-application-review'
import { reviewError } from '../../errors'
import { z } from 'zod'

const RejectDocumentsSchema = z.object({
  expectedUpdatedAt: z.string().min(1),
  rejections: z
    .array(
      z.object({
        documentId: z.string().uuid(),
        // Le motif est lu tel quel par le candidat : il doit être exploitable.
        reason: z.string().trim().min(10, 'Motif trop court').max(500),
      }),
    )
    .min(1, 'Indiquez au moins une pièce à refuser'),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  const { applicationId } = await params
  const parsed = await parseBody(request, RejectDocumentsSchema)
  if (parsed instanceof Response) return parsed

  try {
    await rejectDocuments(applicationId, ctx.user.id, parsed.data)
    return success({ ok: true })
  } catch (err) {
    return reviewError(err)
  }
}
