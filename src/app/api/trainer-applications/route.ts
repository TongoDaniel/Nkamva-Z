// Lot 1 — T1 : créer une candidature formateur (brouillon)
import { success, errorFromException, requireAuth } from '@/lib/api'
import { createApplication, TRAINER_APPLICATION_ERRORS } from '@/lib/trainer-applications'

export async function POST() {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  try {
    const application = await createApplication(ctx.user.id)
    return success(application, {}, 201)
  } catch (err) {
    return errorFromException(err, TRAINER_APPLICATION_ERRORS)
  }
}
