// Lot 2 — Le remboursement a été effectué chez l'opérateur : on débite
import { success, requireAdminSubRole, parseBody } from '@/lib/api'
import { completeManualRefundTask } from '@/lib/dispute-review'
import { reviewError } from '../../../disputes/errors'
import { z } from 'zod'

const CompleteSchema = z.object({ notes: z.string().trim().max(1000).optional() })

export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  const { taskId } = await params
  const parsed = await parseBody(request, CompleteSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await completeManualRefundTask(taskId, ctx.user.id, parsed.data.notes))
  } catch (err) {
    return reviewError(err)
  }
}
