// Formateur — retirer une invitation
//
// Le service accepte aussi bien l'animateur que l'émetteur (un membre qui a
// partagé son lien de parrainage), et il est idempotent : révoquer deux fois
// ne produit pas d'erreur. La route se contente de traduire ses refus.

import { success, error, requireAuth } from '@/lib/api'
import { revokeInvitation } from '@/lib/invitations'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ invitationId: string }> },
) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx
  const { invitationId } = await params

  try {
    await revokeInvitation(invitationId, ctx.user.id)
    return success({ revoked: true })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'INTERNAL_ERROR'
    if (code === 'INVITATION_NOT_FOUND') return error('INVITATION_NOT_FOUND', 'Invitation introuvable.', 404)
    if (code === 'FORBIDDEN') return error('FORBIDDEN', 'Cette invitation n’est pas la vôtre.', 403)
    return error('INTERNAL_ERROR', 'La révocation a échoué.', 500)
  }
}
