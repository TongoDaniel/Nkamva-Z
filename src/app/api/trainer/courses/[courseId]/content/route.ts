// Arbitrage 18 — Formateur : supprimer le contenu d'une ressource jamais vendue
import { success, error, requireTrainer } from '@/lib/api'
import { deleteCourseContent } from '@/lib/courses'

export async function DELETE(_req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const { courseId } = await params

  try {
    const course = await deleteCourseContent(courseId, ctx.user.trainerId!, ctx.user.id)
    return success(course)
  } catch (err: any) {
    if (err.message === 'COURSE_NOT_FOUND') return error('COURSE_NOT_FOUND', 'Introuvable', 404)
    if (err.message === 'NOT_OWNER') return error('NOT_OWNER', 'Non possédé', 403)
    // 409 et non 403 : ce n'est pas un défaut de droit, c'est un état de la
    // ressource. Le formateur en est bien propriétaire — elle a simplement été
    // achetée, et il doit continuer de la servir.
    if (err.message === 'COURSE_SOLD') {
      return error(
        'COURSE_SOLD',
        "Cette ressource a été achetée : son contenu doit rester accessible à ses acheteurs. Elle ne compte plus dans votre quota de stockage.",
        409,
      )
    }
    if (err.message === 'NO_CONTENT') {
      return error('NO_CONTENT', "Cette ressource n'a aucun contenu à supprimer.", 409)
    }
    return error('INTERNAL_ERROR', 'Erreur', 500)
  }
}
