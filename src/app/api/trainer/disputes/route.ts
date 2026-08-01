// Lot 2 — Formateur : litiges portant sur ses ventes
// Décision 19 — reasonDetail et le contenu du fil ne sont JAMAIS exposés ici.
import { requireTrainer, success, parsePagination } from '@/lib/api'
import { listTrainerDisputes } from '@/lib/disputes'

export async function GET(request: Request) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx

  const { page, pageSize } = parsePagination(new URL(request.url))
  const result = await listTrainerDisputes(ctx.user.trainerId!, page, pageSize)
  return success(result.items, { total: result.total, page: result.page, pageSize: result.pageSize })
}
