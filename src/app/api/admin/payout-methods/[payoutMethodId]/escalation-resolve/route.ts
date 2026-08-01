// Lot 3 — Super-admin : trancher une escalade (PM8 / PM9 / PM10, décision 27)
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { resolvePayoutMethodEscalation } from '@/lib/payout-methods'

const ResolveSchema = z.object({
  action: z.enum(['FORCE_VERIFY', 'BLOCK', 'RESTORE']),
  // Une décision d'escalade est toujours motivée : elle contourne le processus
  // standard, elle doit rester auditable.
  justification: z.string().min(10).max(2000),
})

export async function POST(request: Request, { params }: { params: Promise<{ payoutMethodId: string }> }) {
  const ctx = await requireAdminSubRole('SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { payoutMethodId } = await params

  const parsed = await parseBody(request, ResolveSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await resolvePayoutMethodEscalation(payoutMethodId, { ...parsed.data, actorId: ctx.user.id }))
  } catch (err) {
    return errorFromException(err)
  }
}
