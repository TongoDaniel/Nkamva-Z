// Lot 2 — FR5 : le remboursement a échoué, les fonds gelés sont rendus
import { success, requireAdminSubRole, parseBody } from '@/lib/api'
import { cancelManualRefundTask } from '@/lib/dispute-review'
import { reviewError } from '../../../disputes/errors'
import { z } from 'zod'

const CancelSchema = z.object({
  errorMessage: z.string().trim().min(5, 'Indiquez la raison de l’échec').max(1000),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  const { taskId } = await params
  const parsed = await parseBody(request, CancelSchema)
  if (parsed instanceof Response) return parsed

  try {
    await cancelManualRefundTask(taskId, ctx.user.id, parsed.data.errorMessage)
    return success({ ok: true })
  } catch (err) {
    return reviewError(err)
  }
}
