// Suppression de compte : demande et annulation pendant le délai de grâce
import { success, error, requireAuth } from '@/lib/api'
import { requestDeletion, cancelDeletion, type DeletionRefusal, DELETION_GRACE_DAYS } from '@/lib/profile'

const REFUSALS: Record<DeletionRefusal, string> = {
  WALLET_NOT_EMPTY:
    "Votre solde formateur n'est pas nul. Demandez son versement avant de supprimer le compte.",
  PUBLISHED_COURSES:
    'Des ressources sont encore publiées à votre nom. Archivez-les avant de supprimer le compte.',
}

export async function POST() {
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
