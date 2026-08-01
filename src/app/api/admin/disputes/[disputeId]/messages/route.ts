// Lot 2 — Modération : répondre dans le fil (T2 : OPEN → IN_REVIEW)
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { postDisputeMessage, DISPUTE_MESSAGE_MAX_LENGTH } from '@/lib/disputes'

const MessageSchema = z.object({
  body: z.string().min(1).max(DISPUTE_MESSAGE_MAX_LENGTH),
  attachments: z.array(z.string()).max(5).optional(),
})

export async function POST(request: Request, { params }: { params: Promise<{ disputeId: string }> }) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { disputeId } = await params

  const parsed = await parseBody(request, MessageSchema)
  if (parsed instanceof Response) return parsed

  try {
    const message = await postDisputeMessage(disputeId, {
      body: parsed.data.body,
      attachments: parsed.data.attachments,
      authorId: ctx.user.id,
      authorRole: 'SUPPORT',
    })
    return success(message, undefined, 201)
  } catch (err) {
    return errorFromException(err)
  }
}
