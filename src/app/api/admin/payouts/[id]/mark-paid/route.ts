// Lot 3 — P6 : marquer versé (débite balance ET pendingPayoutBalance)
import { z } from 'zod'
import { success, errorFromException, requireAdminSubRole, parseBody } from '@/lib/api'
import { markPayoutPaid, PAYOUT_ERRORS } from '@/lib/payouts'

const MarkPaidSchema = z.object({ providerReference: z.string().optional() })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { id } = await params

  const parsed = await parseBody(request, MarkPaidSchema)
  if (parsed instanceof Response) return parsed

  try {
    await markPayoutPaid(id, ctx.user.id, parsed.data.providerReference)
    return success({ paid: true })
  } catch (err) {
    return errorFromException(err, PAYOUT_ERRORS)
  }
}
