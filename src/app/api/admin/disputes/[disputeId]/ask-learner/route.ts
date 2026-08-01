// Lot 2 — Modération : demander un complément à l'apprenant (T3 / T5)
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { askLearner, DISPUTE_MESSAGE_MAX_LENGTH } from '@/lib/disputes'

const AskLearnerSchema = z.object({
  question: z.string().min(1).max(DISPUTE_MESSAGE_MAX_LENGTH),
  expectedUpdatedAt: z.string(),
})

export async function POST(request: Request, { params }: { params: Promise<{ disputeId: string }> }) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { disputeId } = await params

  const parsed = await parseBody(request, AskLearnerSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await askLearner(disputeId, { ...parsed.data, actorId: ctx.user.id }))
  } catch (err) {
    return errorFromException(err)
  }
}
