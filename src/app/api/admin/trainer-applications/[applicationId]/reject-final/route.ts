// Lot 1 — Modération : rejet définitif (T6 / T7) → le rôle revient à LEARNER
import { canDecideTrainerApplication } from '@/lib/admin-roles'
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { rejectApplicationFinal } from '@/lib/trainer-applications'

const RejectFinalSchema = z.object({
  reason: z.string().min(10).max(2000),
  expectedUpdatedAt: z.string(),
})

export async function POST(request: Request, { params }: { params: Promise<{ applicationId: string }> }) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  // Plan d'action, règle 4 : le Commercial ne valide pas les formateurs qu'il
  // recrute : un administrateur qui cumule Commercial et Modération lit la
  // candidature, il ne la tranche pas.
  if (!canDecideTrainerApplication(ctx.user)) return errorFromException(new Error('SALES_CANNOT_DECIDE_APPLICATION'))
  const { applicationId } = await params

  const parsed = await parseBody(request, RejectFinalSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await rejectApplicationFinal(applicationId, { ...parsed.data, actorId: ctx.user.id }))
  } catch (err) {
    return errorFromException(err)
  }
}
