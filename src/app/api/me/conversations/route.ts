// Fils de l'utilisateur courant — les siens d'apprenant et, s'il en a, ceux de
// formateur. Un formateur reste un apprenant : sa messagerie porte les deux.
import { z } from 'zod'
import { success, requireAuth, parseBody, errorFromException } from '@/lib/api'
import { listMyConversations, openConversation } from '@/lib/messaging'

const OpenSchema = z.object({ communitySlug: z.string().min(1) }).strict()

const FILTERS = ['all', 'unread', 'groups'] as const

/**
 * Le filtre et la recherche vivent **ici**, pas dans l'écran : la recherche
 * couvre le corps des messages (arbitrage 130), que le navigateur n'a pas. Un
 * filtre inconnu retombe sur « toutes » plutôt que de refuser — une URL
 * bricolée ne doit pas produire une liste vide.
 */
export async function GET(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const params = new URL(request.url).searchParams
  const raw = params.get('filtre')
  const filter = (FILTERS as readonly string[]).includes(raw ?? '')
    ? (raw as (typeof FILTERS)[number])
    : 'all'

  return success(
    await listMyConversations(ctx.user.id, ctx.user.trainerId, {
      filter,
      search: params.get('q') ?? undefined,
    }),
  )
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
