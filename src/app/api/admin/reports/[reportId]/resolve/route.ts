// Modération : trancher un signalement (décision 7)
// Retenir un signalement sur une ressource la retire du catalogue ; les
// acheteurs gardent leur accès, l'achat est définitif.
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { resolveReport } from '@/lib/reports'

const ResolveSchema = z.object({
  status: z.enum(['UPHELD', 'DISMISSED']),
  // Jamais une décision muette : l'auteur du signalement la reçoit telle quelle.
  decisionNote: z.string().min(10).max(1000),
  hideTarget: z.boolean().optional(),
  expectedUpdatedAt: z.string(),
})

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { reportId } = await params

  const parsed = await parseBody(request, ResolveSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await resolveReport(reportId, {
      ...parsed.data,
      actorId: ctx.user.id,
      actorRole: ctx.user.adminRole ?? 'MODERATION',
    }))
  } catch (err) {
    return errorFromException(err)
  }
}
