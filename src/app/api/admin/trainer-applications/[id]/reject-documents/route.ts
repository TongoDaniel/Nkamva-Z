// Lot 1 — T4 : rejet partiel (documents ciblés, avec motif)
import { z } from 'zod'
import { success, errorFromException, requireAdminSubRole, parseBody } from '@/lib/api'
import { rejectDocumentsPartial, TRAINER_APPLICATION_ERRORS } from '@/lib/trainer-applications'

const RejectSchema = z.object({
  expectedUpdatedAt: z.string(),
  rejections: z.array(z.object({ documentId: z.string(), reason: z.string().min(1) })).min(1),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { id } = await params

  const parsed = await parseBody(request, RejectSchema)
  if (parsed instanceof Response) return parsed

  try {
    await rejectDocumentsPartial(id, ctx.user.id, new Date(parsed.data.expectedUpdatedAt), parsed.data.rejections)
    return success({ rejected: true })
  } catch (err) {
    return errorFromException(err, TRAINER_APPLICATION_ERRORS)
  }
}
