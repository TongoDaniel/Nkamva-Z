// Lot 2 — Formateur : contester une décision de litige (décision 16)
// Le formateur ne participe pas au fil : la contestation ouvre un SupportTicket.
import { z } from 'zod'
import { success, requireTrainer, parseBody, errorFromException } from '@/lib/api'
import { contestDispute } from '@/lib/disputes'

const ContestSchema = z.object({
  reason: z.string().min(10).max(5000),
  attachments: z.array(z.string()).max(5).optional(),
})

export async function POST(request: Request, { params }: { params: Promise<{ disputeId: string }> }) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const { disputeId } = await params

  const parsed = await parseBody(request, ContestSchema)
  if (parsed instanceof Response) return parsed

  try {
    const ticket = await contestDispute(disputeId, {
      trainerUserId: ctx.user.id,
      trainerProfileId: ctx.user.trainerId!,
      reason: parsed.data.reason,
      attachments: parsed.data.attachments,
    })
    return success(ticket, undefined, 201)
  } catch (err) {
    return errorFromException(err)
  }
}
