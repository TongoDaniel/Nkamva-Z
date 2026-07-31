// Lot 1 — T2 : soumettre la candidature (bascule PENDING_TRAINER)
import { success, errorFromException, requireAuth } from '@/lib/api'
import { getActiveApplicationForUser, submitApplication, TRAINER_APPLICATION_ERRORS } from '@/lib/trainer-applications'

export async function POST() {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  try {
    const application = await getActiveApplicationForUser(ctx.user.id)
    await submitApplication(application.id, ctx.user.id)
    return success({ submitted: true })
  } catch (err) {
    return errorFromException(err, TRAINER_APPLICATION_ERRORS)
  }
}
