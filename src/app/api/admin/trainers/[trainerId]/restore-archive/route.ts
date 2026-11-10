// Plan d'action 2.4 : restauration sur simple demande, par le service client,
// des ressources archivées pour inactivité.
import { success, error, requireAdminSubRole, errorFromException } from '@/lib/api'
import { restoreInactivityArchive } from '@/lib/inactivity-archive'

export async function POST(_request: Request, { params }: { params: Promise<{ trainerId: string }> }) {
  const ctx = await requireAdminSubRole('SUPPORT')
  if (ctx instanceof Response) return ctx
  const { trainerId } = await params
  try {
    return success(await restoreInactivityArchive(trainerId, { id: ctx.user.id, role: 'SUPPORT' }))
  } catch (err) {
    const code = err instanceof Error ? err.message : ''
    if (code === 'TRAINER_NOT_FOUND') return error(code, 'Formateur introuvable.', 404)
    if (code === 'TRAINER_SUSPENDED') {
      return error('TRAINER_SUSPENDED', 'Ce formateur est suspendu : la restauration attend le règlement ou la levée de la sanction.', 409)
    }
    return errorFromException(err)
  }
}
