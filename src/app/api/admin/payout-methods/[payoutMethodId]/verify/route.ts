// Lot 3 — Finances : vérifier un moyen de paiement (PM2 manuel / PM3 micro-virement)
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { verifyPayoutMethod } from '@/lib/payout-methods'

const VerifySchema = z.object({
  method: z.enum(['MANUAL_FINANCE', 'MICRO_DEPOSIT']),
  note: z.string().max(1000).optional(),
  expectedUpdatedAt: z.string(),
})

export async function POST(request: Request, { params }: { params: Promise<{ payoutMethodId: string }> }) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { payoutMethodId } = await params

  const parsed = await parseBody(request, VerifySchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await verifyPayoutMethod(payoutMethodId, {
      ...parsed.data,
      actorId: ctx.user.id,
      actorRole: ctx.user.adminRole ?? 'FINANCES',
    }))
  } catch (err) {
    return errorFromException(err)
  }
}
