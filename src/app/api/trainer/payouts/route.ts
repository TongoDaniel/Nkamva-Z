// Lot 3 — Formateur : ses retraits (GET) / en demander un (POST, P1)
import { z } from 'zod'
import { success, error, requireTrainer, parseBody, parsePagination, errorFromException } from '@/lib/api'
import {
  getRateLimitIdentifier, peekRateLimit, recordRateLimitHit, retryAfterLabel, RATE_LIMITS,
} from '@/lib/rate-limit'
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

  // Le plafond compte les retraits **demandés**, pas les tentatives. Consommé
  // avant la validation, il comptait aussi les refus : trois erreurs (moyen non
  // vérifié, montant sous le minimum) bloquaient les retraits une journée
  // entière (campagne du 12 octobre 2026, M7). Une demande refusée ne crée rien,
  // il n'y a rien à plafonner.
  const counter = getRateLimitIdentifier(ctx.user, request)
  const { max, windowMs } = RATE_LIMITS.PAYOUT_CREATE
  const limit = peekRateLimit(counter, 'PAYOUT_CREATE', max, windowMs)
  if (!limit.allowed) {
    return error(
      'RATE_LIMITED',
      `Plafond atteint : ${max} demandes de retrait par ${windowMs / 3_600_000} h. Réessayez ${retryAfterLabel(limit.retryAfter)}.`,
      429,
    )
  }

  const parsed = await parseBody(request, RequestSchema)
  if (parsed instanceof Response) return parsed

  try {
    const payout = await requestPayout(ctx.user.trainerId!, ctx.user.id, parsed.data.amountFcfa)
    recordRateLimitHit(counter, 'PAYOUT_CREATE', windowMs)
    return success(payout, undefined, 201)
  } catch (err) {
    return errorFromException(err)
  }
}
