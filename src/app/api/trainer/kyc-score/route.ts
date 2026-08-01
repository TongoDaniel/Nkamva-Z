// Lot 3 — Formateur : son score KYC détaillé (décision 1)
import { success, requireTrainer, errorFromException } from '@/lib/api'
import { computeKycScore } from '@/lib/kyc'

export async function GET() {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx

  try {
    return success(await computeKycScore(ctx.user.trainerId!))
  } catch (err) {
    return errorFromException(err)
  }
}
