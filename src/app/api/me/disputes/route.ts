// Lot 2 — Mes contestations : liste et ouverture (T1)
import { success, error, requireAuth, parseBody, parsePagination } from '@/lib/api'
import { listMyDisputes, openDispute, DISPUTE_MESSAGE_MAX_LENGTH } from '@/lib/disputes'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { disputeError } from './errors'
import { z } from 'zod'

const OpenSchema = z.object({
  purchaseId: z.string().uuid(),
  reason: z.enum(['CONTENT_MISMATCH', 'DOUBLE_CHARGE', 'ACCESS_ISSUE', 'UNAUTHORIZED_CHARGE', 'OTHER']),
  reasonDetail: z.string().trim().min(20, 'Décrivez le problème en quelques lignes').max(DISPUTE_MESSAGE_MAX_LENGTH),
})

export async function GET(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const url = new URL(request.url)
  const { page, pageSize } = parsePagination(url.searchParams)
  const result = await listMyDisputes(ctx.user.id, page, pageSize)
  return success(result.items, { total: result.total, page: result.page, pageSize: result.pageSize })
}

export async function POST(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const identifier = getRateLimitIdentifier({ id: ctx.user.id }, request)
  const limit = checkRateLimit(identifier, 'dispute-open', RATE_LIMITS.DISPUTE_OPEN.max, RATE_LIMITS.DISPUTE_OPEN.windowMs)
  if (!limit.allowed) {
    return error('RATE_LIMITED', `Trop de contestations ouvertes. Réessayez dans ${limit.retryAfter} s.`, 429)
  }

  const parsed = await parseBody(request, OpenSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await openDispute(ctx.user.id, parsed.data), {}, 201)
  } catch (err) {
    return disputeError(err)
  }
}
