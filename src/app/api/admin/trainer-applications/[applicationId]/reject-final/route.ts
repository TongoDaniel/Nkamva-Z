// Lot 1 — T6 / T7 : refus définitif
import { success, requireAdminSubRole, parseBody } from '@/lib/api'
import { rejectApplicationFinal } from '@/lib/trainer-application-review'
import { reviewError } from '../../errors'
import { z } from 'zod'

const RejectFinalSchema = z.object({
  expectedUpdatedAt: z.string().min(1),
  reason: z.string().trim().min(10, 'Motif trop court').max(1000),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  const { applicationId } = await params
  const parsed = await parseBody(request, RejectFinalSchema)
  if (parsed instanceof Response) return parsed

  try {
    await rejectApplicationFinal(applicationId, ctx.user.id, parsed.data)
    return success({ ok: true })
  } catch (err) {
    return reviewError(err)
  }
}
