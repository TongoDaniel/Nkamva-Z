// Lot 2 — FR5 : Admin Finances annule une tâche de remboursement manuel
import { z } from 'zod'
import { success, errorFromException, requireAdminSubRole, parseBody } from '@/lib/api'
import { cancelManualRefundTask, MANUAL_REFUND_TASK_ERRORS } from '@/lib/manual-refund-tasks'

const CancelSchema = z.object({ notes: z.string().max(2000).optional() })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { id } = await params

  const parsed = await parseBody(request, CancelSchema)
  if (parsed instanceof Response) return parsed

  try {
    await cancelManualRefundTask(id, ctx.user.id, parsed.data.notes)
    return success({ cancelled: true })
  } catch (err) {
    return errorFromException(err, MANUAL_REFUND_TASK_ERRORS)
  }
}
