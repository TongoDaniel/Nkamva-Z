// Lot 3 — Formateur : ses moyens de paiement (GET) / en ajouter un (POST, PM1)
import { z } from 'zod'
import { success, error, requireTrainer, parseBody, errorFromException } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { createPayoutMethod, listMyPayoutMethods } from '@/lib/payout-methods'

// Décision 28 — deux branches exclusives, le type de compte est choisi en premier.
const CreateSchema = z.object({
  type: z.enum(['BANK_IBAN', 'MOBILE_MONEY']),
  accountNature: z.enum(['INDIVIDUAL', 'BUSINESS']),
  holderName: z.string().min(2).max(200).optional(),
  businessName: z.string().min(2).max(200).optional(),
  businessDocS3Key: z.string().max(500).optional(),
  legalRepProofS3Key: z.string().max(500).optional(),
  iban: z.string().min(15).max(34).optional(),
  bic: z.string().min(8).max(11).optional(),
  mobileOperator: z.enum(['WAVE', 'ORANGE_MONEY', 'MTN_MOMO', 'AIRTEL_MONEY', 'M_PESA']).optional(),
  mobilePhone: z.string().min(6).max(20).optional(),
})

export async function GET() {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  return success(await listMyPayoutMethods(ctx.user.trainerId!))
}

export async function POST(request: Request) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx

  const limit = checkRateLimit(
    getRateLimitIdentifier(ctx.user, request), 'PAYOUT_METHOD_CREATE',
    RATE_LIMITS.PAYOUT_METHOD_CREATE.max, RATE_LIMITS.PAYOUT_METHOD_CREATE.windowMs,
  )
  if (!limit.allowed) return error('RATE_LIMITED', 'Trop de tentatives, réessayez plus tard', 429)

  const parsed = await parseBody(request, CreateSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await createPayoutMethod(ctx.user.trainerId!, ctx.user.id, parsed.data), undefined, 201)
  } catch (err) {
    return errorFromException(err)
  }
}
