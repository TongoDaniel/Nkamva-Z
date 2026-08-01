// Lot 3 — Finances : file des moyens de paiement à vérifier
// Décision 20 — Modération n'a aucun accès aux moyens de paiement.
import { requireAdminSubRole, success, parsePagination } from '@/lib/api'
import { listPayoutMethods } from '@/lib/payout-methods'
import type { PayoutMethodVerificationStatus } from '@prisma/client'

export async function GET(request: Request) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  const url = new URL(request.url)
  const { page, pageSize } = parsePagination(url)
  const result = await listPayoutMethods({
    status: (url.searchParams.get('status') as PayoutMethodVerificationStatus) || undefined,
    page, pageSize,
  })
  return success(result.items, { total: result.total, page: result.page, pageSize: result.pageSize })
}
