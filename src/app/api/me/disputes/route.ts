// Lot 2 — Apprenant : lister ses litiges (GET) / ouvrir un litige (POST, T1)
import { z } from 'zod'
import { success, error, requireAuth, parseBody, parsePagination, errorFromException } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { openDispute, listMyDisputes, DISPUTE_MESSAGE_MAX_LENGTH } from '@/lib/disputes'

const OpenDisputeSchema = z.object({
  purchaseId: z.string().uuid(),
  reason: z.enum(['CONTENT_MISMATCH', 'DOUBLE_CHARGE', 'ACCESS_ISSUE', 'UNAUTHORIZED_CHARGE', 'OTHER']),
  reasonDetail: z.string().max(DISPUTE_MESSAGE_MAX_LENGTH).optional(),
  attachments: z.array(z.string()).max(5).optional(),
})

export async function GET(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const { page, pageSize } = parsePagination(new URL(request.url))
  const result = await listMyDisputes(ctx.user.id, page, pageSize)
  return success(result.items, { total: result.total, page: result.page, pageSize: result.pageSize })
}

export async function POST(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const limit = checkRateLimit(
    getRateLimitIdentifier(ctx.user, request), 'DISPUTE_OPEN',
    RATE_LIMITS.DISPUTE_OPEN.max, RATE_LIMITS.DISPUTE_OPEN.windowMs,
  )
  if (!limit.allowed) return error('RATE_LIMITED', 'Trop d\'ouvertures de litige, réessayez plus tard', 429)

  const parsed = await parseBody(request, OpenDisputeSchema)
  if (parsed instanceof Response) return parsed

  try {
    const dispute = await openDispute(ctx.user.id, parsed.data)
    return success(dispute, undefined, 201)
  } catch (err) {
    return errorFromException(err)
  }
}
