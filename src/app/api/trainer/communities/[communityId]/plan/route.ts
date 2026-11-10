// Modèle économique v1.1 : plan Community. Le formateur pose ou retire le
// plafond de sa communauté (rester en Découverte, gratuit, par exemple). Le
// plan facturé suit la taille, sans dépasser ce plafond.
import { z } from 'zod'
import { success, error, requireTrainer, parseBody, errorFromException } from '@/lib/api'
import { setCommunityMaxPlan } from '@/lib/community-plans'

const Schema = z.object({ maxPlan: z.enum(['DECOUVERTE', 'ESSENTIEL', 'CROISSANCE', 'PREMIUM']).nullable() })

export async function POST(request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const { communityId } = await params
  const parsed = await parseBody(request, Schema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await setCommunityMaxPlan(communityId, ctx.user.id, parsed.data.maxPlan))
  } catch (err) {
    if (err instanceof Error && err.message === 'COMMUNITY_NOT_FOUND') {
      return error('COMMUNITY_NOT_FOUND', 'Communauté introuvable.', 404)
    }
    return errorFromException(err)
  }
}
