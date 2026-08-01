// Lot 2 — T3 / T5 : demander une précision à l'apprenant
import { success, requireAdminSubRole, parseBody } from '@/lib/api'
import { askLearner } from '@/lib/dispute-review'
import { reviewError } from '../../errors'
import { z } from 'zod'

const AskSchema = z.object({
  expectedUpdatedAt: z.string().min(1),
  question: z.string().trim().min(10, 'Question trop courte').max(2000),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ disputeId: string }> },
) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  const { disputeId } = await params
  const parsed = await parseBody(request, AskSchema)
  if (parsed instanceof Response) return parsed

  try {
    await askLearner(disputeId, ctx.user.id, parsed.data)
    return success({ ok: true })
  } catch (err) {
    return reviewError(err)
  }
}
