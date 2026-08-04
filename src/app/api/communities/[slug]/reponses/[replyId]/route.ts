// Retirer une réponse. Route à part du message qui la porte : une réponse a son
// propre identifiant, et la retrouver via son message obligerait l'appelant à
// transporter les deux.
import { success, requireAuth, errorFromException } from '@/lib/api'
import { deleteReply } from '@/lib/community-space'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string; replyId: string }> },
) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const { slug, replyId } = await params
  try {
    await deleteReply(slug, replyId, ctx.user.id)
    return success({ deleted: true })
  } catch (err) {
    return errorFromException(err)
  }
}
