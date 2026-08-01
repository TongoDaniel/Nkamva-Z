// Lot 3 — Finances : rejeter un retrait (P5) — libère l'engagement, solde intact
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { rejectPayout } from '@/lib/payouts'

const RejectSchema = z.object({
  reason: z.string().min(10).max(1000),
  expectedUpdatedAt: z.string(),
})

export async function POST(request: Request, { params }: { params: Promise<{ payoutId: string }> }) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { payoutId } = await params

  const parsed = await parseBody(request, RejectSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await rejectPayout(payoutId, {
      ...parsed.data, actorId: ctx.user.id, actorRole: ctx.user.adminRole ?? 'FINANCES',
    }))
  } catch (err) {
    return errorFromException(err)
  }
}
