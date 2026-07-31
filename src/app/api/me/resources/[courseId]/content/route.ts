// Lot 4 — Accès au contenu d'un cours acheté
import { success, error, requireAuth } from '@/lib/api'
import { getCourseContentUrl } from '@/lib/access'

export async function GET(_req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const { courseId } = await params

  try {
    const result = await getCourseContentUrl(courseId, ctx.user.id)
    return success(result)
  } catch (err: any) {
    if (err.message === 'NOT_PURCHASED') return error('NOT_PURCHASED', 'Vous n\'avez pas acheté ce cours', 403)
    if (err.message === 'ACCESS_SUSPENDED') return error('ACCESS_SUSPENDED', 'Accès suspendu suite à un litige', 403)
    if (err.message === 'COURSE_NOT_FOUND') return error('COURSE_NOT_FOUND', 'Cours introuvable', 404)
    return error('INTERNAL_ERROR', 'Erreur', 500)
  }
}
