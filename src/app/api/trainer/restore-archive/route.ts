// Plan d'action 2.4 : le formateur restaure lui-même ses ressources archivées
// pour inactivité (et annule un préavis en cours).
import { success, error, requireTrainer, errorFromException } from '@/lib/api'
import { restoreInactivityArchive } from '@/lib/inactivity-archive'

export async function POST() {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  try {
    return success(await restoreInactivityArchive(ctx.user.trainerId!, { id: ctx.user.id, role: 'TRAINER' }))
  } catch (err) {
    if (err instanceof Error && err.message === 'TRAINER_SUSPENDED') {
      return error('TRAINER_SUSPENDED', "Votre compte est suspendu : réglez d'abord l'échéance en attente.", 409)
    }
    return errorFromException(err)
  }
}
