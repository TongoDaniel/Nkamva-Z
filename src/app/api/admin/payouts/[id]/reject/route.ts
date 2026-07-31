// Lot 3 — P5 : rejeter un retrait
import { z } from 'zod'
import { success, errorFromException, requireAdminSubRole, parseBody } from '@/lib/api'
import { rejectPayout, PAYOUT_ERRORS } from '@/lib/payouts'

const RejectSchema = z.object({ expectedUpdatedAt: z.string(), reason: z.string().min(1).max(2000) })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { id } = await params

  const parsed = await parseBody(request, RejectSchema)
  if (parsed instanceof Response) return parsed

  try {
    await rejectPayout(id, ctx.user.id, new Date(parsed.data.expectedUpdatedAt), parsed.data.reason)
    return success({ rejected: true })
  } catch (err) {
    return errorFromException(err, PAYOUT_ERRORS)
  }
}
