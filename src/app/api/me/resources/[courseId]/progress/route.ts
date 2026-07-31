// Lot 4 — Mettre à jour la progression de visionnage
import { success, error, requireAuth, parseBody } from '@/lib/api'
import { updateWatchProgress } from '@/lib/access'
import { z } from 'zod'

const ProgressSchema = z.object({
  watchedSeconds: z.number().int().min(0),
})

export async function POST(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const { courseId } = await params
  const parsed = await parseBody(request, ProgressSchema)
  if (parsed instanceof Response) return parsed

  try {
    await updateWatchProgress(courseId, ctx.user.id, parsed.data.watchedSeconds)
    return success({ ok: true })
  } catch (err: any) {
    if (err.message === 'NOT_PURCHASED') return error('NOT_PURCHASED', 'Non acheté', 403)
    if (err.message === 'ACCESS_SUSPENDED') return error('ACCESS_SUSPENDED', 'Accès suspendu', 403)
    return error('INTERNAL_ERROR', 'Erreur', 500)
  }
}
