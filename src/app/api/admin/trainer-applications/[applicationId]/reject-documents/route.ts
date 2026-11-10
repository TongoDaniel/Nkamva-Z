// Lot 1 — Modération : rejet partiel de pièces (T4) → RESUBMISSION_PENDING
import { canDecideTrainerApplication } from '@/lib/admin-roles'
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { rejectDocuments } from '@/lib/trainer-applications'

const RejectDocumentsSchema = z.object({
  rejections: z.array(z.object({
    documentId: z.string().uuid(),
    rejectionReason: z.string().min(5).max(1000),
  })).min(1).max(3),
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

  const parsed = await parseBody(request, RejectDocumentsSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await rejectDocuments(applicationId, { ...parsed.data, actorId: ctx.user.id }))
  } catch (err) {
    return errorFromException(err)
  }
}
