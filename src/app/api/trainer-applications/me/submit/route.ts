// Lot 1 — Soumettre sa candidature (T2, ou T5 en re-soumission)
import { success, requireAuth, errorFromException } from '@/lib/api'
import { submitApplication } from '@/lib/trainer-applications'

export async function POST() {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  try {
    return success(await submitApplication(ctx.user.id))
  } catch (err) {
    return errorFromException(err)
  }
}
