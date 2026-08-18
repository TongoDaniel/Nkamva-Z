// Lot 4 — Formateur : publier un cours
import { success, requireTrainer, errorFromException } from '@/lib/api'
import { publishCourse } from '@/lib/courses'

export async function POST(_req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const { courseId } = await params

  try {
    const course = await publishCourse(courseId, ctx.user.trainerId!, ctx.user.id)
    return success(course)
  } catch (err) {
    // Cette liste écrite à la main s'arrêtait aux trois premiers refus et
    // oubliait les deux derniers que `publishCourse` lève pourtant —
    // `CONTENT_REQUIRED` et `SUBSCRIPTION_SUSPENDED`. Le formateur qui publiait
    // un brouillon sans contenu lisait « Erreur » en 500 : le seul motif qui
    // lui disait quoi faire était justement celui qu'on écrasait.
    return errorFromException(err)
  }
}
