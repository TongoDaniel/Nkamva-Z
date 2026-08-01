// Lot 2 — Finances : annuler le remboursement → FR5 (libération sans débit)
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { cancelManualRefundTask } from '@/lib/manual-refund-tasks'

const CancelSchema = z.object({
  reason: z.string().min(10).max(2000),
})

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { taskId } = await params

  const parsed = await parseBody(request, CancelSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await cancelManualRefundTask(taskId, { reason: parsed.data.reason, actorId: ctx.user.id }))
  } catch (err) {
    return errorFromException(err)
  }
}
