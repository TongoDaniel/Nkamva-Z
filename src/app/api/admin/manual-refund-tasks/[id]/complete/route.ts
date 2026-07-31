// Lot 2 — Admin Finances : marquer une tâche de remboursement manuel comme complétée
import { success, errorFromException, requireAdminSubRole } from '@/lib/api'
import { completeManualRefundTask, MANUAL_REFUND_TASK_ERRORS } from '@/lib/manual-refund-tasks'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { id } = await params

  try {
    await completeManualRefundTask(id, ctx.user.id)
    return success({ completed: true })
  } catch (err) {
    return errorFromException(err, MANUAL_REFUND_TASK_ERRORS)
  }
}
