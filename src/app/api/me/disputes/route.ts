// Lot 2 — T1 (LEARNER_REQUEST) : lister / ouvrir mes litiges
import { z } from 'zod'
import { success, errorFromException, requireAuth, parseBody } from '@/lib/api'
import { openDispute, listMyDisputes, DISPUTE_ERRORS } from '@/lib/disputes'

const OpenSchema = z.object({
  purchaseId: z.string(),
  reason: z.enum(['CONTENT_MISMATCH', 'DOUBLE_CHARGE', 'ACCESS_ISSUE', 'UNAUTHORIZED_CHARGE', 'OTHER']),
  reasonDetail: z.string().max(2000).optional(),
})

export async function GET(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx
  const url = new URL(request.url)
  const page = Number(url.searchParams.get('page') || '1')
  const pageSize = Math.min(Number(url.searchParams.get('pageSize') || '20'), 50)
  const result = await listMyDisputes(ctx.user.id, page, pageSize)
  return success(result.items, { page: result.page, pageSize: result.pageSize, total: result.total })
}

export async function POST(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx
  const parsed = await parseBody(request, OpenSchema)
  if (parsed instanceof Response) return parsed

  try {
    const dispute = await openDispute(ctx.user.id, parsed.data.purchaseId, parsed.data.reason, parsed.data.reasonDetail)
    return success(dispute, {}, 201)
  } catch (err) {
    return errorFromException(err, DISPUTE_ERRORS)
  }
}
