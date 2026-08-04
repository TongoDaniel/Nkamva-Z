// Une séance — y entrer, la piloter, la quitter.
//
// L'action est portée par le corps plutôt que par une route par verbe : lever la
// main, couper un micro et donner la parole sont des gestes de la même console,
// et les éclater en cinq routes ferait cinq fois la même garde d'animateur.
import { z } from 'zod'
import { success, error, requireAuth, parseBody, errorFromException } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import {
  joinLiveSession, leaveLiveSession, startLiveSession, endLiveSession,
  cancelLiveSession, toggleHand, setParticipantMuted, muteEveryone,
  postLiveMessage, lowerParticipantHand, LIVE_MESSAGE_MAX_LENGTH,
} from '@/lib/lives'

const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('end') }),
  z.object({ action: z.literal('cancel') }),
  z.object({ action: z.literal('leave') }),
  z.object({ action: z.literal('hand'), raised: z.boolean() }),
  z.object({ action: z.literal('mute'), userId: z.string().uuid(), muted: z.boolean() }),
  z.object({ action: z.literal('mute-all') }),
  z.object({ action: z.literal('lower-hand'), userId: z.string().uuid() }),
  z.object({ action: z.literal('message'), body: z.string().min(1).max(LIVE_MESSAGE_MAX_LENGTH) }),
])

type Params = { params: Promise<{ sessionId: string }> }

/** Entrer en salle : présence enregistrée, jeton de transport rendu. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const { sessionId } = await params
  try {
    return success(await joinLiveSession(sessionId, ctx.user.id))
  } catch (err) {
    return errorFromException(err)
  }
}

export async function POST(request: Request, { params }: Params) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const parsed = await parseBody(request, ActionSchema)
  if (parsed instanceof Response) return parsed
  const input = parsed.data

  // Seul le salon est plafonné : les gestes de console sont peu nombreux par
  // nature, et brider l'animateur en pleine séance serait pire que le risque.
  if (input.action === 'message') {
    const limit = checkRateLimit(
      getRateLimitIdentifier(ctx.user, request), 'live-message',
      RATE_LIMITS.DISPUTE_MESSAGE.max, RATE_LIMITS.DISPUTE_MESSAGE.windowMs,
    )
    if (!limit.allowed) return error('RATE_LIMITED', 'Trop de messages, réessayez dans un instant', 429)
  }

  const { sessionId } = await params
  try {
    switch (input.action) {
      case 'start':
        return success(await startLiveSession(sessionId, ctx.user.id))
      case 'end':
        return success(await endLiveSession(sessionId, ctx.user.id))
      case 'cancel':
        await cancelLiveSession(sessionId, ctx.user.id)
        return success({ canceled: true })
      case 'leave':
        await leaveLiveSession(sessionId, ctx.user.id)
        return success({ left: true })
      case 'hand':
        return success(await toggleHand(sessionId, ctx.user.id, input.raised))
      case 'mute':
        return success(await setParticipantMuted(sessionId, input.userId, ctx.user.id, input.muted))
      case 'mute-all':
        return success(await muteEveryone(sessionId, ctx.user.id))
      case 'lower-hand':
        return success(await lowerParticipantHand(sessionId, input.userId, ctx.user.id))
      case 'message':
        return success(await postLiveMessage(sessionId, ctx.user.id, input.body), undefined, 201)
    }
  } catch (err) {
    return errorFromException(err)
  }
}
