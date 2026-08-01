// Lot 2 — Admin : remboursements à exécuter à la main
//
// Réservé aux finances (décision 7) : la modération décide du remboursement,
// les finances l'exécutent chez l'opérateur.
import { success, requireAdminSubRole } from '@/lib/api'
import { listManualRefundTasks } from '@/lib/dispute-review'

export async function GET(request: Request) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  const status = new URL(request.url).searchParams.get('status') || undefined
  return success(await listManualRefundTasks(status))
}
