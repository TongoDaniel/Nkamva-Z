// Lot 4 — Accès au contenu d'un cours acheté
import { success, error, requireAuth, errorFromException } from '@/lib/api'
import { getCourseContentUrl } from '@/lib/access'

export async function GET(_req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const { courseId } = await params

  try {
    const result = await getCourseContentUrl(courseId, ctx.user.id)
    return success(result)
  } catch (err) {
    const code = err instanceof Error ? err.message : ''
    if (code === 'NOT_PURCHASED') return error('NOT_PURCHASED', 'Vous n\'avez pas acheté ce cours', 403)
    if (code === 'ACCESS_SUSPENDED') return error('ACCESS_SUSPENDED', 'Accès suspendu suite à un litige', 403)
    if (code === 'COURSE_NOT_FOUND') return error('COURSE_NOT_FOUND', 'Cours introuvable', 404)
    // `CONTENT_UNAVAILABLE` manquait : l'acheteur d'une ressource dont le
    // formateur a supprimé le fichier lisait « Erreur », comme une panne.
    return errorFromException(err)
  }
}
