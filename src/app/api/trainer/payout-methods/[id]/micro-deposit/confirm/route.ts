// Lot 3 — PM4 : confirmer les 2 montants du micro-dépôt
import { z } from 'zod'
import { success, errorFromException, requireTrainer, parseBody } from '@/lib/api'
import { confirmMicroDeposit, PAYOUT_METHOD_ERRORS } from '@/lib/payout-methods'

const ConfirmSchema = z.object({ amount1: z.number().int(), amount2: z.number().int() })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const { id } = await params

  const parsed = await parseBody(request, ConfirmSchema)
  if (parsed instanceof Response) return parsed

  try {
    await confirmMicroDeposit(id, ctx.user.id, parsed.data.amount1, parsed.data.amount2)
    return success({ verified: true })
  } catch (err) {
    return errorFromException(err, PAYOUT_METHOD_ERRORS)
  }
}
