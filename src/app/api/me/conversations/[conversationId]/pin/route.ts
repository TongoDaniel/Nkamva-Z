// Épingler une conversation, ou retirer l'épingle (arbitrage 130).
//
// L'épingle est **personnelle** : elle vit dans `ConversationRead`, avec le
// curseur de lecture, parce que les deux répondent à la même question — ce que
// cette personne a fait de cette conversation.
//
// Celle du formateur sur le groupe qu'il anime n'est pas ici : elle est
// systématique, donc déduite et non stockée. La demander se solde par un refus
// explicite plutôt que par une écriture sans effet.
import { z } from 'zod'
import { success, requireAuth, parseBody, errorFromException } from '@/lib/api'
import { setConversationPinned } from '@/lib/messaging'

const PinSchema = z.object({ pinned: z.boolean() }).strict()

type Params = { params: Promise<{ conversationId: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const parsed = await parseBody(request, PinSchema)
  if (parsed instanceof Response) return parsed

  const { conversationId } = await params
  try {
    return success(
      await setConversationPinned(
        conversationId,
        ctx.user.id,
        ctx.user.trainerId,
        parsed.data.pinned,
      ),
    )
  } catch (err) {
    return errorFromException(err)
  }
}
