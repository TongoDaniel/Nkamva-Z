// Formateur — paramétrer sa communauté
//
// La visibilité passe par `setCommunityVisibility` et non par un simple champ :
// fermer un salon révoque, dans la même transaction, les liens partageables en
// circulation (arbitrage 81). Écrire `visibility` à la main laisserait ces
// liens vivants — et une communauté privée ouverte à qui détient l'URL.

import { success, error, requireTrainer, parseBody, domainErrorResponse } from '@/lib/api'
import {
  updateCommunity,
  COMMUNITY_NAME_MAX,
  COMMUNITY_DESCRIPTION_MAX,
  COMMUNITY_RULES_MAX,
  COMMUNITY_MIN_PRICE_FCFA,
} from '@/lib/communities'
import { setCommunityVisibility } from '@/lib/invitations'
import { z } from 'zod'

const UpdateSchema = z.object({
  name: z.string().trim().min(3).max(COMMUNITY_NAME_MAX).optional(),
  description: z.string().trim().max(COMMUNITY_DESCRIPTION_MAX).nullable().optional(),
  rules: z.string().trim().max(COMMUNITY_RULES_MAX).nullable().optional(),
  priceFcfa: z.number().int().min(COMMUNITY_MIN_PRICE_FCFA).optional(),
  forumEnabled: z.boolean().optional(),

  messagingEnabled: z.boolean().optional(),
  resourcesEnabled: z.boolean().optional(),
  eventsEnabled: z.boolean().optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ communityId: string }> },
) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const { communityId } = await params

  const parsed = await parseBody(request, UpdateSchema)
  if (parsed instanceof Response) return parsed
  const { visibility, ...fields } = parsed.data

  try {
    // La visibilité d'abord : si elle échoue, rien d'autre n'a bougé.
    let revokedShareLinks = 0
    if (visibility) {
      const change = await setCommunityVisibility(communityId, ctx.user.id, visibility)
      revokedShareLinks = change.revokedShareLinks
    }

    const community = Object.keys(fields).length
      ? await updateCommunity(communityId, ctx.user.trainerId!, ctx.user.id, fields)
      : null

    return success({ community, revokedShareLinks })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'INTERNAL_ERROR'
    if (code === 'COMMUNITY_NOT_FOUND') return error('COMMUNITY_NOT_FOUND', 'Communauté introuvable.', 404)
    if (code === 'NOT_OWNER' || code === 'NOT_COMMUNITY_TRAINER') {
      return error('NOT_OWNER', 'Cette communauté n’est pas la vôtre.', 403)
    }
    if (code === 'SUBSCRIPTION_SUSPENDED') {
      return error('SUBSCRIPTION_SUSPENDED', 'Votre abonnement est suspendu : réglez-le pour modifier votre salon.', 403)
    }
    if (code === 'PRICE_TOO_LOW') {
      return error('PRICE_TOO_LOW', `Le prix d'adhésion minimum est de ${COMMUNITY_MIN_PRICE_FCFA} FCFA.`, 400)
    }
    if (code === 'COMMUNITY_CLOSED') return error('COMMUNITY_CLOSED', 'Cette communauté est close.', 409)
    return domainErrorResponse(err) ?? error('INTERNAL_ERROR', 'La modification n’a pas pu être enregistrée.', 500)
  }
}
