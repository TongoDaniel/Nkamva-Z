// Lot 2 — T6/T7 : résoudre (FULL_REFUND, PARTIAL_REFUND, REJECT, policyOverride Super-admin)
import { z } from 'zod'
import { success, errorFromException, requireAdminSubRole, parseBody } from '@/lib/api'
import { resolveDisputeWithRefund, rejectDispute, DISPUTE_ERRORS } from '@/lib/disputes'

const ResolveSchema = z.object({
  expectedUpdatedAt: z.string(),
  resolution: z.enum(['FULL_REFUND', 'PARTIAL_REFUND', 'REJECT']),
  partialAmountFcfa: z.number().int().positive().optional(),
  note: z.string().max(2000).optional(),
  policyOverride: z.boolean().optional(),
  overrideJustification: z.string().max(2000).optional(),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { id } = await params

  const parsed = await parseBody(request, ResolveSchema)
  if (parsed instanceof Response) return parsed
  const expectedUpdatedAt = new Date(parsed.data.expectedUpdatedAt)

  try {
    if (parsed.data.resolution === 'REJECT') {
      await rejectDispute(id, ctx.user.id, expectedUpdatedAt)
    } else {
      await resolveDisputeWithRefund(id, ctx.user.id, expectedUpdatedAt, {
        resolutionType: parsed.data.resolution,
        partialAmountFcfa: parsed.data.partialAmountFcfa,
        note: parsed.data.note,
        policyOverride: parsed.data.policyOverride,
        overrideJustification: parsed.data.overrideJustification,
        isSuperAdmin: ctx.user.adminRole === 'SUPER_ADMIN',
      })
    }
    return success({ resolved: true })
  } catch (err) {
    return errorFromException(err, DISPUTE_ERRORS)
  }
}
