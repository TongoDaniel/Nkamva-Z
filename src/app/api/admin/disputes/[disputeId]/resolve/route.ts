// Lot 2 — Modération : résoudre un litige (T6 remboursement / T7 rejet)
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { resolveDispute } from '@/lib/disputes'

const ResolveSchema = z.object({
  resolution: z.enum(['FULL_REFUND', 'PARTIAL_REFUND', 'REJECT']),
  // Obligatoire : une résolution débite un formateur ou clôt la demande d'un
  // apprenant, et elle lui est notifiée. Sans motif consigné, ni l'un ni l'autre
  // ne peut savoir pourquoi, et la contestation qui suit s'instruit à l'aveugle.
  // Le champ était optionnel, et la console envoyait `note` : chaque décision
  // prise depuis l'interface perdait silencieusement sa justification.
  resolutionNote: z.string().trim().min(10, 'Motif trop court').max(2000),
  refundAmountFcfa: z.number().int().positive().optional(),
  // Bypass de la règle 14 j / 30 % — Super-admin uniquement, justification obligatoire.
  policyOverride: z.boolean().optional(),
  overrideJustification: z.string().min(10).max(2000).optional(),
  expectedUpdatedAt: z.string(),
})

export async function POST(request: Request, { params }: { params: Promise<{ disputeId: string }> }) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { disputeId } = await params

  const parsed = await parseBody(request, ResolveSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await resolveDispute(disputeId, {
      ...parsed.data,
      actorId: ctx.user.id,
      actorAdminRole: ctx.user.adminRole!,
    }))
  } catch (err) {
    return errorFromException(err)
  }
}
