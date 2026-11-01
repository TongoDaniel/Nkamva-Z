import { success, requireTrainer, parsePagination, errorFromException } from '@/lib/api'
import { getTrainerSalesSummary, listTrainerSales } from '@/lib/trainer-stats'

/**
 * Historique des ventes du formateur, une page à la fois, avec les montants
 * de tête. Mêmes fonctions que la page `/formateur/ventes`.
 */
export async function GET(request: Request) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const trainerId = ctx.user.trainerId!

  const { page, pageSize } = parsePagination(new URL(request.url))
  try {
    const [result, summary] = await Promise.all([
      listTrainerSales(trainerId, page, pageSize),
      getTrainerSalesSummary(trainerId),
    ])
    return success(result.rows, { total: result.total, page: result.page, pageSize: result.pageSize, summary })
  } catch (err) {
    return errorFromException(err)
  }
}
