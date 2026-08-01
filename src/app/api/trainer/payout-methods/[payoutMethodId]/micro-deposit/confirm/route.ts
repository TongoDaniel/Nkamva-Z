// Lot 3 — Formateur : confirmer les 2 micro-virements (PM4, décision 22c)
import { z } from 'zod'
import { success, error, requireTrainer, parseBody, errorFromException } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { confirmMicroDeposit, MICRO_DEPOSIT_MIN, MICRO_DEPOSIT_MAX } from '@/lib/payout-methods'

const ConfirmSchema = z.object({
  amount1: z.number().int().min(MICRO_DEPOSIT_MIN).max(MICRO_DEPOSIT_MAX),
  amount2: z.number().int().min(MICRO_DEPOSIT_MIN).max(MICRO_DEPOSIT_MAX),
})

export async function POST(request: Request, { params }: { params: Promise<{ payoutMethodId: string }> }) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const { payoutMethodId } = await params

  // Un échec incrémente le compteur de rejets : on limite le brute-force.
  const limit = checkRateLimit(
    getRateLimitIdentifier(ctx.user, request), 'MICRO_DEPOSIT_CONFIRM',
    RATE_LIMITS.MICRO_DEPOSIT_CONFIRM.max, RATE_LIMITS.MICRO_DEPOSIT_CONFIRM.windowMs,
  )
  if (!limit.allowed) return error('RATE_LIMITED', 'Trop de tentatives, réessayez plus tard', 429)

  const parsed = await parseBody(request, ConfirmSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await confirmMicroDeposit(payoutMethodId, ctx.user.trainerId!, ctx.user.id, parsed.data))
  } catch (err) {
    return errorFromException(err)
  }
}
