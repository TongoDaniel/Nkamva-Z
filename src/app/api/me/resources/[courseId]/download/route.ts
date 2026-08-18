// Lot 4 — Marquer un cours comme téléchargé
import { success, error, requireAuth, errorFromException } from '@/lib/api'
import { markCourseDownloaded } from '@/lib/access'

export async function POST(_req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const { courseId } = await params

  try {
    await markCourseDownloaded(courseId, ctx.user.id)
    return success({ ok: true })
  } catch (err) {
    const code = err instanceof Error ? err.message : ''
    if (code === 'NOT_PURCHASED') return error('NOT_PURCHASED', 'Non acheté', 403)
    if (code === 'ACCESS_SUSPENDED') return error('ACCESS_SUSPENDED', 'Accès suspendu', 403)
    if (code === 'NOT_DOWNLOADABLE') return error('NOT_DOWNLOADABLE', 'Format non téléchargeable', 400)
    // `COURSE_NOT_FOUND` manquait ici alors que la route voisine le traduit.
    return errorFromException(err)
  }
}
