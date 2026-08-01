// Lot 2 — Finances : le virement a été exécuté → FR3/FR4 (débit réel du formateur)
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { completeManualRefundTask } from '@/lib/manual-refund-tasks'

const CompleteSchema = z.object({
  providerRefundId: z.string().max(255).optional(),
  notes: z.string().max(2000).optional(),
})

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { taskId } = await params

  const parsed = await parseBody(request, CompleteSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await completeManualRefundTask(taskId, { ...parsed.data, actorId: ctx.user.id }))
  } catch (err) {
    return errorFromException(err)
  }
}
