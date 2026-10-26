// Lot 1 — Soumettre sa candidature (T2, ou T5 en re-soumission)
import { success, requireAuth, requireVerifiedEmail, errorFromException } from '@/lib/api'
import { submitApplication } from '@/lib/trainer-applications'

export async function POST() {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx
  // M6 — un formateur reçoit ses reçus et ses alertes de retrait à cette
  // adresse : elle doit être prouvée avant de candidater.
  const unverified = await requireVerifiedEmail(ctx.user.id)
  if (unverified) return unverified

  try {
    return success(await submitApplication(ctx.user.id))
  } catch (err) {
    return errorFromException(err)
  }
}
