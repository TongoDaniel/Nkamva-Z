// Lot 3 — Score KYC du formateur (exact + 5 critères, transparence)
import { success, requireTrainer } from '@/lib/api'
import { computeKycScore } from '@/lib/kyc'

export async function GET() {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  return success(await computeKycScore(ctx.user.trainerId!))
}
