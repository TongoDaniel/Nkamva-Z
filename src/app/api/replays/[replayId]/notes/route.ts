// Les notes d'un membre sur un replay — revue du 16 novembre 2026.
//
// Privées : chacun ne lit et n'écrit que les siennes. Même droit d'accès que la
// lecture du replay (`hasReplayAccess`).
import { z } from 'zod'
import { success, requireAuth, parseBody, errorFromException } from '@/lib/api'
import { getReplayNote, saveReplayNote, REPLAY_NOTE_MAX } from '@/lib/lives'

type Params = { params: Promise<{ replayId: string }> }

const NoteSchema = z.object({ body: z.string().max(REPLAY_NOTE_MAX) }).strict()

export async function GET(_request: Request, { params }: Params) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx
  const { replayId } = await params
  try {
    return success(await getReplayNote(replayId, ctx.user.id))
  } catch (err) {
    return errorFromException(err)
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx
  const parsed = await parseBody(request, NoteSchema)
  if (parsed instanceof Response) return parsed
  const { replayId } = await params
  try {
    return success(await saveReplayNote(replayId, ctx.user.id, parsed.data.body))
  } catch (err) {
    return errorFromException(err)
  }
}
