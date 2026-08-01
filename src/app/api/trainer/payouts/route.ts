// Lot 3 — Formateur : ses retraits (GET) / en demander un (POST, P1)
import { z } from 'zod'
import { success, error, requireTrainer, parseBody, parsePagination, errorFromException } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { requestPayout, listMyPayouts, PAYOUT_MIN_AMOUNT_FCFA } from '@/lib/payouts'

const RequestSchema = z.object({
  amountFcfa: z.number().int().min(PAYOUT_MIN_AMOUNT_FCFA),
})

export async function GET(request: Request) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx

  const { page, pageSize } = parsePagination(new URL(request.url))
  const result = await listMyPayouts(ctx.user.trainerId!, page, pageSize)
  return success(result.items, { total: result.total, page: result.page, pageSize: result.pageSize })
}

export async function POST(request: Request) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx

  const limit = checkRateLimit(
    getRateLimitIdentifier(ctx.user, request), 'PAYOUT_CREATE',
    RATE_LIMITS.PAYOUT_CREATE.max, RATE_LIMITS.PAYOUT_CREATE.windowMs,
  )
  if (!limit.allowed) return error('RATE_LIMITED', 'Trop de demandes, réessayez plus tard', 429)

  const parsed = await parseBody(request, RequestSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await requestPayout(ctx.user.trainerId!, ctx.user.id, parsed.data.amountFcfa), undefined, 201)
  } catch (err) {
    return errorFromException(err)
  }
}
