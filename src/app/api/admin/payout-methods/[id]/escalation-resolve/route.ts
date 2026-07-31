// Lot 3 — PM8/PM9/PM10 : résoudre une escalade (Super-admin uniquement)
import { z } from 'zod'
import { success, errorFromException, requireAdminSubRole, parseBody } from '@/lib/api'
import { resolvePayoutMethodEscalation, PAYOUT_METHOD_ERRORS } from '@/lib/payout-methods'

const ResolveSchema = z.object({ action: z.enum(['FORCE_VERIFY', 'BLOCK', 'RESTORE']), justification: z.string().min(1).max(2000) })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminSubRole('SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { id } = await params

  const parsed = await parseBody(request, ResolveSchema)
  if (parsed instanceof Response) return parsed

  try {
    await resolvePayoutMethodEscalation(id, ctx.user.id, parsed.data.action, parsed.data.justification)
    return success({ resolved: true })
  } catch (err) {
    return errorFromException(err, PAYOUT_METHOD_ERRORS)
  }
}
