// Lot 2 — T4 : réponse de l'apprenant dans le fil
import { success, error, requireAuth, parseBody } from '@/lib/api'
import { postLearnerMessage, DISPUTE_MESSAGE_MAX_LENGTH } from '@/lib/disputes'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { disputeError } from '../../errors'
import { z } from 'zod'

const MessageSchema = z.object({
  body: z.string().trim().min(1, 'Message vide').max(DISPUTE_MESSAGE_MAX_LENGTH),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ disputeId: string }> },
) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const identifier = getRateLimitIdentifier({ id: ctx.user.id }, request)
  const limit = checkRateLimit(identifier, 'dispute-message', RATE_LIMITS.DISPUTE_MESSAGE.max, RATE_LIMITS.DISPUTE_MESSAGE.windowMs)
  if (!limit.allowed) {
    return error('RATE_LIMITED', `Trop de messages. Réessayez dans ${limit.retryAfter} s.`, 429)
  }

  const { disputeId } = await params
  const parsed = await parseBody(request, MessageSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await postLearnerMessage(disputeId, ctx.user.id, parsed.data.body), {}, 201)
  } catch (err) {
    return disputeError(err)
  }
}
