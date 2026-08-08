// Formateur — ouvrir le fil privé d'un de ses membres
//
// Pendant du `POST /api/me/conversations` côté apprenant. Deux routes et non
// une : celle de l'apprenant se contente d'un slug de communauté parce qu'il
// n'y a qu'un fil possible pour lui ; celle-ci désigne un membre, et doit donc
// vérifier que la communauté est bien celle de qui appelle.

import { z } from 'zod'
import { success, error, requireTrainer, parseBody } from '@/lib/api'
import { openConversationWithMember } from '@/lib/messaging'

const OpenSchema = z.object({ learnerId: z.string().uuid() }).strict()

export async function POST(
  request: Request,
  { params }: { params: Promise<{ communityId: string }> },
) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const { communityId } = await params

  const parsed = await parseBody(request, OpenSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await openConversationWithMember(communityId, parsed.data.learnerId, ctx.user.id))
  } catch (err) {
    const code = err instanceof Error ? err.message : 'INTERNAL_ERROR'
    const messages: Record<string, [string, number]> = {
      COMMUNITY_NOT_FOUND: ['Communauté introuvable.', 404],
      NOT_OWNER: ['Cette communauté n’est pas la vôtre.', 403],
      NOT_MEMBER: ['Cette personne n’est plus membre de votre salon.', 409],
      MESSAGING_DISABLED: ['Les messages directs sont fermés sur ce salon.', 409],
      ACCOUNT_RESTRICTED: ['Votre compte est restreint : vous ne pouvez pas écrire.', 403],
    }
    const [message, status] = messages[code] ?? ['Le fil n’a pas pu être ouvert.', 500]
    return error(code, message, status)
  }
}
