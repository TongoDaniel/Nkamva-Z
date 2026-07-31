// Lot 1 — T2 / T5 : soumission du dossier à la revue
import { success, requireAuth } from '@/lib/api'
import { submitApplication } from '@/lib/trainer-applications'
import { applicationError } from '../../errors'

export async function POST() {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  try {
    return success(await submitApplication(ctx.user.id))
  } catch (err) {
    return applicationError(err)
  }
}
