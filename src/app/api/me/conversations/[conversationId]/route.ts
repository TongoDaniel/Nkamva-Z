// Un fil — le lire, y écrire, le marquer lu.
import { z } from 'zod'
import { success, error, requireAuth, parseBody, errorFromException } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import {
  getConversation, sendMessage, markConversationRead, MESSAGE_MAX_LENGTH,
} from '@/lib/messaging'

const SendSchema = z.object({ body: z.string().min(1).max(MESSAGE_MAX_LENGTH) }).strict()

type Params = { params: Promise<{ conversationId: string }> }

export async function GET(_request: Request, { params }: Params) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const { conversationId } = await params
  try {
    return success(await getConversation(conversationId, ctx.user.id, ctx.user.trainerId))
  } catch (err) {
    return errorFromException(err)
  }
}

export async function POST(request: Request, { params }: Params) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const limit = checkRateLimit(
    getRateLimitIdentifier(ctx.user, request), 'message-send',
    RATE_LIMITS.DISPUTE_MESSAGE.max, RATE_LIMITS.DISPUTE_MESSAGE.windowMs,
  )
  if (!limit.allowed) return error('RATE_LIMITED', 'Trop de messages, réessayez dans un instant', 429)

  const parsed = await parseBody(request, SendSchema)
  if (parsed instanceof Response) return parsed

  const { conversationId } = await params
  try {
    return success(
      await sendMessage(conversationId, ctx.user.id, ctx.user.trainerId, parsed.data),
      undefined,
      201,
    )
  } catch (err) {
    return errorFromException(err)
  }
}

/** Accusé de lecture. Sans corps : il n'y a rien à choisir, on a lu ou non. */
export async function PATCH(_request: Request, { params }: Params) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const { conversationId } = await params
  try {
    return success(await markConversationRead(conversationId, ctx.user.id, ctx.user.trainerId))
  } catch (err) {
    return errorFromException(err)
  }
}
