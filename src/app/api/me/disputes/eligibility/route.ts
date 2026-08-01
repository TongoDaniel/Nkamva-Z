// Lot 2 — Recevabilité d'une contestation, avant de l'ouvrir
//
// Expose le verdict en amont : mieux vaut expliquer à l'apprenant pourquoi son
// achat n'ouvre pas droit à remboursement que le lui opposer une fois le
// dossier rempli.
import { success, requireAuth } from '@/lib/api'
import { getDisputeEligibility } from '@/lib/disputes'
import { disputeError } from '../errors'

export async function GET(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const purchaseId = new URL(request.url).searchParams.get('purchaseId') ?? ''

  try {
    const { purchase, verdict } = await getDisputeEligibility(purchaseId, ctx.user.id)
    return success({
      purchaseId: purchase.id,
      courseTitle: purchase.course?.title ?? null,
      ...verdict,
    })
  } catch (err) {
    return disputeError(err)
  }
}
