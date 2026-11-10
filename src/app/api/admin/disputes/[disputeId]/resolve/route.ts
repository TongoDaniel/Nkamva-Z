// Lot 2 — Modération : résoudre un litige (T6 remboursement / T7 rejet)
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { resolveDispute } from '@/lib/disputes'
import { db } from '@/lib/db'
import { canValidateRefund, hasAdminRole } from '@/lib/admin-roles'

const ResolveSchema = z.object({
  resolution: z.enum(['FULL_REFUND', 'PARTIAL_REFUND', 'REJECT']),
  // Obligatoire : une résolution débite un formateur ou clôt la demande d'un
  // apprenant, et elle lui est notifiée. Sans motif consigné, ni l'un ni l'autre
  // ne peut savoir pourquoi, et la contestation qui suit s'instruit à l'aveugle.
  // Le champ était optionnel, et la console envoyait `note` : chaque décision
  // prise depuis l'interface perdait silencieusement sa justification.
  resolutionNote: z.string().trim().min(10, 'Motif trop court').max(2000),
  refundAmountFcfa: z.number().int().positive().optional(),
  // Bypass de la règle de remboursement (7 jours, changement d'avis) : Super-admin uniquement, justification obligatoire.
  policyOverride: z.boolean().optional(),
  overrideJustification: z.string().min(10).max(2000).optional(),
  // Modèle v1.1 : à qui revient la faute : décide qui porte les frais non
  // récupérables. Sans valeur, celle que propose le motif déclaré.
  faultParty: z.enum(['TECHNICAL', 'TRAINER', 'BUYER']).optional(),
  expectedUpdatedAt: z.string(),
})

export async function POST(request: Request, { params }: { params: Promise<{ disputeId: string }> }) {
  // Modèle v1.1 : « l'administrateur financier la valide ou la refuse ». La
  // Modération ne touche pas à l'argent (plan d'action, section 2).
  const ctx = await requireAdminSubRole('FINANCES')
  if (ctx instanceof Response) return ctx
  const { disputeId } = await params

  const parsed = await parseBody(request, ResolveSchema)
  if (parsed instanceof Response) return parsed

  // Règle 1 : un remboursement se valide sur proposition du service client, et
  // jamais par la personne qui l'a proposé. Un refus n'engage pas d'argent :
  // Finances peut le prononcer sans proposition.
  if (parsed.data.resolution !== 'REJECT') {
    const dispute = await db.dispute.findUnique({ where: { id: disputeId }, select: { proposedById: true } })
    if (dispute && !dispute.proposedById) return errorFromException(new Error('REFUND_PROPOSAL_REQUIRED'))
    if (dispute && !canValidateRefund(ctx.user, dispute.proposedById)) {
      return errorFromException(new Error('SAME_PERSON_PROPOSED'))
    }
  }

  try {
    return success(await resolveDispute(disputeId, {
      ...parsed.data,
      actorId: ctx.user.id,
      // Le contournement de la règle reste réservé au Propriétaire.
      actorAdminRole: hasAdminRole(ctx.user, 'SUPER_ADMIN') ? 'SUPER_ADMIN' : 'FINANCES',
    }))
  } catch (err) {
    return errorFromException(err)
  }
}
