// Lot 2 — Litiges portant sur les ressources du formateur
import { success, requireTrainer, parsePagination } from '@/lib/api'
import { listTrainerDisputes, getFrozenTotal } from '@/lib/trainer-disputes'

export async function GET(request: Request) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx

  const url = new URL(request.url)
  const { page, pageSize } = parsePagination(url.searchParams)
  const result = await listTrainerDisputes(ctx.user.trainerId!, page, pageSize)

  return success(result.items, {
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    frozenTotalFcfa: await getFrozenTotal(ctx.user.trainerId!),
  })
}
