// Finances : constater le règlement d'une période d'abonnement (décision 70)
// Aucun provider d'abonnement n'est branché : le règlement est constaté à la
// main, comme un versement de retrait l'est par `mark-paid`. C'est ce constat,
// et lui seul, qui lève un impayé.
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { settleSubscriptionCharge } from '@/lib/subscriptions'

const SettleSchema = z.object({
  reference: z.string().max(255).optional(),
})

export async function POST(request: Request, { params }: { params: Promise<{ chargeId: string }> }) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { chargeId } = await params

  const parsed = await parseBody(request, SettleSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await settleSubscriptionCharge(chargeId, {
      actorId: ctx.user.id,
      actorRole: ctx.user.adminRole ?? 'FINANCES',
      reference: parsed.data.reference,
    }))
  } catch (err) {
    return errorFromException(err)
  }
}
