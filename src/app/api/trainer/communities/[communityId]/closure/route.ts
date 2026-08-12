// Arbitrage 2 — fermer sa communauté, et revenir dessus.
//
// Rien n'écrivait jamais autre chose que `active` dans `Community.status` : la
// porte était testée partout en lecture, personne ne pouvait la pousser. C'est
// ce qui rendait la résiliation d'abonnement impossible pour un formateur ayant
// des membres payants — on lui demandait un geste qui n'existait pas.
import { success, error, requireTrainer } from '@/lib/api'
import { closeCommunity, reopenCommunity } from '@/lib/communities'

/** Ferme : plus d'adhésion nouvelle, celles en cours vont à leur terme. */
export async function POST(_req: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const { communityId } = await params

  try {
    const result = await closeCommunity(communityId, ctx.user.trainerId!, ctx.user.id)
    return success(result)
  } catch (err) {
    return closureError(err)
  }
}

/** Rouvre, tant que le formateur n'est pas parti. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const { communityId } = await params

  try {
    return success(await reopenCommunity(communityId, ctx.user.trainerId!, ctx.user.id))
  } catch (err) {
    return closureError(err)
  }
}

function closureError(err: unknown) {
  const code = err instanceof Error ? err.message : 'INTERNAL_ERROR'
  if (code === 'COMMUNITY_NOT_FOUND') return error('COMMUNITY_NOT_FOUND', 'Communauté introuvable.', 404)
  if (code === 'NOT_OWNER') return error('NOT_OWNER', 'Cette communauté n’est pas la vôtre.', 403)
  if (code === 'COMMUNITY_ALREADY_CLOSED') {
    return error('COMMUNITY_ALREADY_CLOSED', 'Cette communauté est déjà fermée.', 409)
  }
  if (code === 'COMMUNITY_NOT_CLOSED') {
    return error('COMMUNITY_NOT_CLOSED', 'Cette communauté est ouverte.', 409)
  }
  if (code === 'SUBSCRIPTION_SUSPENDED') {
    return error('SUBSCRIPTION_SUSPENDED', 'Votre abonnement est suspendu : réglez-le pour rouvrir votre salon.', 403)
  }
  return error('INTERNAL_ERROR', "L'opération n'a pas pu être enregistrée.", 500)
}
