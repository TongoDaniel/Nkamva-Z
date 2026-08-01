// Lot 2 — T6 / T7 : décision sur un litige
import { success, requireAdminSubRole, parseBody } from '@/lib/api'
import { resolveDispute } from '@/lib/dispute-review'
import { reviewError } from '../../errors'
import { z } from 'zod'

const ResolveSchema = z.object({
  expectedUpdatedAt: z.string().min(1),
  resolution: z.enum(['FULL_REFUND', 'PARTIAL_REFUND', 'REJECT']),
  note: z.string().trim().min(10, 'Motif trop court').max(2000),
  refundAmountFcfa: z.number().int().positive().optional(),
  overrideJustification: z.string().trim().min(10).max(2000).optional(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ disputeId: string }> },
) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  const { disputeId } = await params
  const parsed = await parseBody(request, ResolveSchema)
  if (parsed instanceof Response) return parsed

  try {
    // La dérogation au barème n'est ouverte qu'au super-administrateur : le
    // service le vérifie, la route lui transmet seulement le sous-rôle.
    const result = await resolveDispute(
      disputeId,
      ctx.user.id,
      ctx.user.adminRole === 'SUPER_ADMIN',
      parsed.data,
    )
    return success(result)
  } catch (err) {
    return reviewError(err)
  }
}
