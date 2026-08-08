// Lot 4 — Formateur : confirme un téléversement et enregistre la clé.
//
// Sans cette étape, l'objet vivait sur R2 sans que rien ne le référence : le
// contenu servi à l'acheteur était une clé devinée, jamais écrite.
import { z } from 'zod'
import { success, requireTrainer, parseBody, errorFromException } from '@/lib/api'
import { confirmCourseUpload } from '@/lib/courses'

const ConfirmSchema = z.object({
  s3Key: z.string().min(1).max(500),
  kind: z.enum(['video', 'pdf', 'image', 'archive']),
  mimeType: z.string().min(1).max(120),
})

export async function POST(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const { courseId } = await params

  const parsed = await parseBody(request, ConfirmSchema)
  if (parsed instanceof Response) return parsed

  try {
    const course = await confirmCourseUpload(courseId, ctx.user.trainerId!, ctx.user.id, parsed.data)
    return success({
      id: course.id,
      coverS3Key: course.coverS3Key,
      contentS3Key: course.contentS3Key,
      contentSizeBytes: course.contentSizeBytes,
    })
  } catch (err) {
    return errorFromException(err)
  }
}
