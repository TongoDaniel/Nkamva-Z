// Modèle économique v1.1 : le formateur choisit son plan Marketplace :
// « Vous ne payez que quand vous vendez » (0 FCFA, 10 %) ou Pro (15 000 FCFA
// par mois, 3 %). Le Pro prend effet au règlement de sa période ; le retour au
// plan de base, en fin de période payée, sans pénalité.
import { z } from 'zod'
import { success, error, requireTrainer, parseBody, errorFromException } from '@/lib/api'
import { getMyPlan, requestBasePlan, requestProPlan } from '@/lib/trainer-plans'

const PlanSchema = z.object({ plan: z.enum(['BASE', 'PRO']) })

export async function GET() {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  return success(await getMyPlan(ctx.user.trainerId!))
}

export async function POST(request: Request) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const parsed = await parseBody(request, PlanSchema)
  if (parsed instanceof Response) return parsed

  try {
    const result = parsed.data.plan === 'PRO'
      ? await requestProPlan(ctx.user.trainerId!, ctx.user.id)
      : await requestBasePlan(ctx.user.trainerId!, ctx.user.id)
    return success(result)
  } catch (err) {
    const code = err instanceof Error ? err.message : ''
    if (code === 'PRO_NOT_YET_AVAILABLE') {
      return error(code, 'Le plan Pro ouvre à tous les formateurs le 1er mars 2027. Il est déjà ouvert aux formateurs fondateurs.', 403)
    }
    if (code === 'ALREADY_PRO') return error(code, 'Vous êtes déjà sur le plan Pro.', 409)
    if (code === 'ALREADY_BASE') return error(code, 'Vous êtes déjà sur le plan « Vous ne payez que quand vous vendez ».', 409)
    if (code === 'SUBSCRIPTION_SUSPENDED') return error(code, "Réglez d'abord l'échéance en attente.", 409)
    return errorFromException(err)
  }
}
