// Lot 1 — T6/T7 : rejet définitif (retour LEARNER)
import { z } from 'zod'
import { success, errorFromException, requireAdminSubRole, parseBody } from '@/lib/api'
import { rejectApplicationFinal, TRAINER_APPLICATION_ERRORS } from '@/lib/trainer-applications'

const RejectFinalSchema = z.object({
  expectedUpdatedAt: z.string(),
  reason: z.string().min(1),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { id } = await params

  const parsed = await parseBody(request, RejectFinalSchema)
  if (parsed instanceof Response) return parsed

  try {
    await rejectApplicationFinal(id, ctx.user.id, new Date(parsed.data.expectedUpdatedAt), parsed.data.reason)
    return success({ rejected: true })
  } catch (err) {
    return errorFromException(err, TRAINER_APPLICATION_ERRORS)
  }
}
