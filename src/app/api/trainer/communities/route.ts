// Formateur — ouvrir et relire sa communauté
//
// Rien ne créait de communauté : ni route, ni service. Le modèle, les
// adhésions, les salons, la messagerie, les lives et les invitations
// reposaient tous sur un objet qu'aucun formateur ne pouvait faire naître.

import { fmtFcfa } from '@/lib/format'
import { success, error, requireTrainer, parseBody, domainErrorResponse } from '@/lib/api'
import {
  createCommunity,
  getMyCommunity,
  COMMUNITY_NAME_MAX,
  COMMUNITY_DESCRIPTION_MAX,
  COMMUNITY_RULES_MAX,
  COMMUNITY_MIN_PRICE_FCFA,
  COMMUNITY_MAX_PRICE_FCFA,
} from '@/lib/communities'
import { z } from 'zod'

const CreateSchema = z.object({
  name: z.string().trim().min(3).max(COMMUNITY_NAME_MAX),
  description: z.string().trim().max(COMMUNITY_DESCRIPTION_MAX).optional().nullable(),
  rules: z.string().trim().max(COMMUNITY_RULES_MAX).optional().nullable(),
  priceFcfa: z.number().int().min(COMMUNITY_MIN_PRICE_FCFA).max(COMMUNITY_MAX_PRICE_FCFA),
  forumEnabled: z.boolean().optional(),

  messagingEnabled: z.boolean().optional(),
  resourcesEnabled: z.boolean().optional(),
  eventsEnabled: z.boolean().optional(),
})

export async function GET() {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  return success(await getMyCommunity(ctx.user.trainerId!))
}

export async function POST(request: Request) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx

  const parsed = await parseBody(request, CreateSchema)
  if (parsed instanceof Response) return parsed

  try {
    const community = await createCommunity(ctx.user.trainerId!, ctx.user.id, parsed.data)
    return success(community, {}, 201)
  } catch (err) {
    const code = err instanceof Error ? err.message : 'INTERNAL_ERROR'
    if (code === 'COMMUNITY_ALREADY_EXISTS') {
      return error('COMMUNITY_ALREADY_EXISTS', 'Vous animez déjà une communauté.', 409)
    }
    if (code === 'SUBSCRIPTION_SUSPENDED') {
      return error('SUBSCRIPTION_SUSPENDED', 'Votre abonnement est suspendu : réglez-le pour ouvrir un salon.', 403)
    }
    if (code === 'PRICE_TOO_HIGH') {
      return error('PRICE_TOO_HIGH', `Le prix d'adhésion maximum est de ${fmtFcfa(COMMUNITY_MAX_PRICE_FCFA)}.`, 400)
    }
    if (code === 'PRICE_TOO_LOW') {
      return error('PRICE_TOO_LOW', `Le prix d'adhésion minimum est de ${COMMUNITY_MIN_PRICE_FCFA} FCFA.`, 400)
    }
    if (code === 'NAME_REQUIRED') return error('NAME_REQUIRED', 'Donnez un nom à votre communauté.', 400)
    // Les dépassements de longueur restaient muets. Le repli maison est gardé
    // pour ce qui est vraiment une panne : il dit mieux qu'« Erreur interne »
    // ce qui vient d'échouer.
    return domainErrorResponse(err) ?? error('INTERNAL_ERROR', 'La communauté n’a pas pu être créée.', 500)
  }
}
