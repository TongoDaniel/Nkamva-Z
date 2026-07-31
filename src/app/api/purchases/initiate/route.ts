// Lot 4 — Achat : initier un paiement
import { success, error, requireAuth, parseBody } from '@/lib/api'
import { initiatePurchase } from '@/lib/purchases'
import { z } from 'zod'

const InitiateSchema = z.object({
  courseId: z.string().uuid(),
  provider: z.enum(['STRIPE', 'CINETPAY']),
})

export async function POST(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const parsed = await parseBody(request, InitiateSchema)
  if (parsed instanceof Response) return parsed

  try {
    const result = await initiatePurchase(parsed.data.courseId, ctx.user.id, parsed.data.provider)
    return success(result, {}, 201)
  } catch (err: any) {
    if (err.message === 'COURSE_NOT_FOUND') return error('COURSE_NOT_FOUND', 'Cours introuvable', 404)
    if (err.message === 'COURSE_NOT_AVAILABLE') return error('COURSE_NOT_AVAILABLE', 'Cours non disponible', 403)
    if (err.message === 'ALREADY_PURCHASED') return error('ALREADY_PURCHASED', 'Déjà acheté', 409)
    return error('INTERNAL_ERROR', 'Erreur', 500)
  }
}
