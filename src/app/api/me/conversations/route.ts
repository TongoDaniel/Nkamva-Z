// Fils de l'utilisateur courant — les siens d'apprenant et, s'il en a, ceux de
// formateur. Un formateur reste un apprenant : sa messagerie porte les deux.
import { z } from 'zod'
import { success, requireAuth, parseBody, errorFromException } from '@/lib/api'
import { listMyConversations, openConversation } from '@/lib/messaging'

const OpenSchema = z.object({ communitySlug: z.string().min(1) }).strict()

export async function GET() {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  return success(await listMyConversations(ctx.user.id, ctx.user.trainerId))
}

/** Ouvre le fil avec le formateur d'une communauté, ou retrouve celui qui existe. */
export async function POST(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const parsed = await parseBody(request, OpenSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await openConversation(parsed.data.communitySlug, ctx.user.id))
  } catch (err) {
    return errorFromException(err)
  }
}
