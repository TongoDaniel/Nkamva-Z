// Lot 4 — Formateur : archiver un cours
import { success, error, requireTrainer } from '@/lib/api'
import { archiveCourse } from '@/lib/courses'

export async function POST(_req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const { courseId } = await params

  try {
    const course = await archiveCourse(courseId, ctx.user.trainerId!, ctx.user.id)
    return success(course)
  } catch (err: any) {
    if (err.message === 'COURSE_NOT_FOUND') return error('COURSE_NOT_FOUND', 'Introuvable', 404)
    if (err.message === 'NOT_OWNER') return error('NOT_OWNER', 'Non possédé', 403)
    return error('INTERNAL_ERROR', 'Erreur', 500)
  }
}
