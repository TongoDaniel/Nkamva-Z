// Lot 2 — T3/T5 : demander une information complémentaire à l'apprenant
import { z } from 'zod'
import { success, errorFromException, requireAdminSubRole, parseBody } from '@/lib/api'
import { askLearner, DISPUTE_ERRORS } from '@/lib/disputes'

const AskSchema = z.object({ expectedUpdatedAt: z.string(), question: z.string().min(1).max(5000) })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { id } = await params

  const parsed = await parseBody(request, AskSchema)
  if (parsed instanceof Response) return parsed

  try {
    await askLearner(id, ctx.user.id, new Date(parsed.data.expectedUpdatedAt), parsed.data.question)
    return success({ asked: true })
  } catch (err) {
    return errorFromException(err, DISPUTE_ERRORS)
  }
}
