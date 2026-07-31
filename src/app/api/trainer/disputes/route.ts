// Lot 2 — Formateur : lister les litiges le concernant (reason enum, jamais reasonDetail)
import { success, requireTrainer } from '@/lib/api'
import { listTrainerDisputes } from '@/lib/disputes'

export async function GET(request: Request) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const url = new URL(request.url)
  const page = Number(url.searchParams.get('page') || '1')
  const pageSize = Math.min(Number(url.searchParams.get('pageSize') || '20'), 50)
  const result = await listTrainerDisputes(ctx.user.trainerId!, page, pageSize)
  return success(result.items, { page: result.page, pageSize: result.pageSize, total: result.total })
}
