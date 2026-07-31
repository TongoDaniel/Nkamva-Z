// Lot 3 — PM6 : rejeter (3 rejets → BLOCKED + escalade)
import { z } from 'zod'
import { success, errorFromException, requireAdminSubRole, parseBody } from '@/lib/api'
import { rejectPayoutMethod, PAYOUT_METHOD_ERRORS } from '@/lib/payout-methods'

const RejectSchema = z.object({ reason: z.string().min(1).max(2000) })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { id } = await params

  const parsed = await parseBody(request, RejectSchema)
  if (parsed instanceof Response) return parsed

  try {
    await rejectPayoutMethod(id, ctx.user.id, parsed.data.reason)
    return success({ rejected: true })
  } catch (err) {
    return errorFromException(err, PAYOUT_METHOD_ERRORS)
  }
}
