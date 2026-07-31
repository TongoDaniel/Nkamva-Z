// Lot 3 — P1 : lister / demander un retrait
import { z } from 'zod'
import { success, errorFromException, requireTrainer, parseBody } from '@/lib/api'
import { requestPayout, listTrainerPayouts, PAYOUT_ERRORS } from '@/lib/payouts'

const RequestSchema = z.object({ amountFcfa: z.number().int().positive() })

export async function GET(request: Request) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const url = new URL(request.url)
  const page = Number(url.searchParams.get('page') || '1')
  const pageSize = Math.min(Number(url.searchParams.get('pageSize') || '20'), 50)
  const result = await listTrainerPayouts(ctx.user.trainerId!, page, pageSize)
  return success(result.items, { page: result.page, pageSize: result.pageSize, total: result.total })
}

export async function POST(request: Request) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const parsed = await parseBody(request, RequestSchema)
  if (parsed instanceof Response) return parsed

  try {
    const payout = await requestPayout(ctx.user.trainerId!, ctx.user.id, parsed.data.amountFcfa)
    return success(payout, {}, 201)
  } catch (err) {
    return errorFromException(err, PAYOUT_ERRORS)
  }
}
