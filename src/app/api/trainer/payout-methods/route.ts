// Lot 3 — PM1 : lister / créer mes moyens de paiement
import { z } from 'zod'
import { success, errorFromException, requireTrainer, parseBody } from '@/lib/api'
import { createPayoutMethod, listOwnPayoutMethods, PAYOUT_METHOD_ERRORS } from '@/lib/payout-methods'

const CreateSchema = z.object({
  type: z.enum(['BANK_IBAN', 'MOBILE_MONEY']),
  accountNature: z.enum(['INDIVIDUAL', 'BUSINESS']),
  holderName: z.string().optional(),
  businessName: z.string().optional(),
  iban: z.string().optional(),
  bic: z.string().optional(),
  mobileOperator: z.enum(['WAVE', 'ORANGE_MONEY', 'MTN_MOMO', 'AIRTEL_MONEY', 'M_PESA']).optional(),
  mobilePhone: z.string().optional(),
})

export async function GET() {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  return success(await listOwnPayoutMethods(ctx.user.trainerId!))
}

export async function POST(request: Request) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const parsed = await parseBody(request, CreateSchema)
  if (parsed instanceof Response) return parsed

  try {
    const method = await createPayoutMethod(ctx.user.trainerId!, ctx.user.id, parsed.data)
    return success(method, {}, 201)
  } catch (err) {
    return errorFromException(err, PAYOUT_METHOD_ERRORS)
  }
}
