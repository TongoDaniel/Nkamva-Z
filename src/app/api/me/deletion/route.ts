// Suppression de compte : demande et annulation pendant le délai de grâce
import { success, error, requireAuth } from '@/lib/api'
import { requestDeletion, cancelDeletion, type DeletionRefusal, DELETION_GRACE_DAYS } from '@/lib/profile'

/**
 * Chaque refus dit quoi faire pour lever l'obstacle — sauf le premier, qui
 * n'est pas une situation à solder mais une règle de gouvernance.
 */
const REFUSALS: Record<DeletionRefusal, string> = {
  ADMIN_ACCOUNT:
    "Un compte d'administration ne se supprime pas lui-même : vos décisions doivent rester attribuables. Demandez à un super-administrateur de fermer votre compte.",
  WALLET_NOT_EMPTY:
    "Votre solde formateur n'est pas nul. Demandez son versement avant de supprimer le compte.",
  PAYOUT_IN_FLIGHT:
    'Un retrait est en cours. Attendez son versement avant de supprimer le compte.',
  PUBLISHED_COURSES:
    'Des ressources sont encore publiées à votre nom. Archivez-les avant de supprimer le compte.',
  ACTIVE_COMMUNITY:
    'Votre communauté compte encore des membres. Prévenez-les et fermez-la avant de supprimer le compte.',
  OPEN_DISPUTE:
    'Un litige vous concernant est en cours. Il doit être tranché avant la suppression du compte.',
}

export async function POST() {
  // `requireAuth` et non `requireLearner` : le refus opposé à un administrateur
  // vient du service, qui sait dire *pourquoi* — le message générique de
  // `requireLearner` parle d'achat et d'adhésion, pas de suppression.
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const result = await requestDeletion(ctx.user.id, ctx.user.trainerId)
  if (!result.ok) return error(result.reason, REFUSALS[result.reason], 422)

  return success({
    deletionScheduledAt: result.scheduledAt,
    graceDays: DELETION_GRACE_DAYS,
  })
}

export async function DELETE() {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const canceled = await cancelDeletion(ctx.user.id)
  if (!canceled) return error('NO_DELETION_PENDING', 'Aucune suppression en attente.', 409)

  return success({ ok: true })
}
