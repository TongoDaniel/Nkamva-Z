// Plan d'action, séparation des tâches (règle 1) : le service client propose
// une décision sur un litige ; Finances la valide, par une autre personne.
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { proposeDisputeResolution } from '@/lib/disputes'

const ProposeSchema = z.object({
  resolution: z.enum(['FULL_REFUND', 'PARTIAL_REFUND', 'REJECT']),
  refundAmountFcfa: z.number().int().positive().optional(),
  faultParty: z.enum(['TECHNICAL', 'TRAINER', 'BUYER']).optional(),
  note: z.string().trim().min(10, 'Motif trop court').max(2000),
})

export async function POST(request: Request, { params }: { params: Promise<{ disputeId: string }> }) {
  const ctx = await requireAdminSubRole('SUPPORT')
  if (ctx instanceof Response) return ctx
  const { disputeId } = await params

  const parsed = await parseBody(request, ProposeSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await proposeDisputeResolution(disputeId, { ...parsed.data, actorId: ctx.user.id }))
  } catch (err) {
    return errorFromException(err)
  }
}
