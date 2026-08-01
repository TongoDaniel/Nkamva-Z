// Lot 2 — Apprenant : répondre dans le fil (T4 si le litige attend sa réponse)
import { z } from 'zod'
import { success, error, requireAuth, parseBody, errorFromException } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { postDisputeMessage, DISPUTE_MESSAGE_MAX_LENGTH } from '@/lib/disputes'

const MessageSchema = z.object({
  body: z.string().min(1).max(DISPUTE_MESSAGE_MAX_LENGTH),
  attachments: z.array(z.string()).max(5).optional(),
})

export async function POST(request: Request, { params }: { params: Promise<{ disputeId: string }> }) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx
  const { disputeId } = await params

  const limit = checkRateLimit(
    getRateLimitIdentifier(ctx.user, request), 'DISPUTE_MESSAGE',
    RATE_LIMITS.DISPUTE_MESSAGE.max, RATE_LIMITS.DISPUTE_MESSAGE.windowMs,
  )
  if (!limit.allowed) return error('RATE_LIMITED', 'Trop de messages, réessayez plus tard', 429)

  const parsed = await parseBody(request, MessageSchema)
  if (parsed instanceof Response) return parsed

  try {
    const message = await postDisputeMessage(disputeId, {
      body: parsed.data.body,
      attachments: parsed.data.attachments,
      authorId: ctx.user.id,
      authorRole: 'LEARNER',
    })
    return success(message, undefined, 201)
  } catch (err) {
    return errorFromException(err)
  }
}
