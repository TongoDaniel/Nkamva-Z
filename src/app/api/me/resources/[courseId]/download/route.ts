// Lot 4 — Marquer un cours comme téléchargé
import { success, error, requireAuth } from '@/lib/api'
import { markCourseDownloaded } from '@/lib/access'

export async function POST(_req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const { courseId } = await params

  try {
    await markCourseDownloaded(courseId, ctx.user.id)
    return success({ ok: true })
  } catch (err: any) {
    if (err.message === 'NOT_PURCHASED') return error('NOT_PURCHASED', 'Non acheté', 403)
    if (err.message === 'ACCESS_SUSPENDED') return error('ACCESS_SUSPENDED', 'Accès suspendu', 403)
    if (err.message === 'NOT_DOWNLOADABLE') return error('NOT_DOWNLOADABLE', 'Format non téléchargeable', 400)
    return error('INTERNAL_ERROR', 'Erreur', 500)
  }
}
