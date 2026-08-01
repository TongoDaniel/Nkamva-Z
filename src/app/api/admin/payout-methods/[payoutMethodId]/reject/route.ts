// Lot 3 — Finances : rejeter un moyen de paiement (PM6)
// Au 3e rejet, le formateur est bloqué et l'escalade Super-admin est ouverte.
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { rejectPayoutMethod } from '@/lib/payout-methods'

const RejectSchema = z.object({
  // Décision 30 — jamais un rejet opaque : le motif est repris dans le message
  // au formateur.
  reason: z.string().min(10).max(1000),
  expectedUpdatedAt: z.string(),
})

export async function POST(request: Request, { params }: { params: Promise<{ payoutMethodId: string }> }) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { payoutMethodId } = await params

  const parsed = await parseBody(request, RejectSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await rejectPayoutMethod(payoutMethodId, {
      ...parsed.data,
      actorId: ctx.user.id,
      actorRole: ctx.user.adminRole ?? 'FINANCES',
    }))
  } catch (err) {
    return errorFromException(err)
  }
}
