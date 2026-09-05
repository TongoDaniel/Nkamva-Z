// Lot 4 — Formateur : détail + maj cours
import { success, error, requireTrainer, parseBody, errorFromException } from '@/lib/api'
import { updateCourse } from '@/lib/courses'
import { db } from '@/lib/db'
import { z } from 'zod'

/**
 * Ni `durationSeconds` ni `lessonsCount` : la durée se mesure sur le fichier à
 * la confirmation du téléversement, et le nombre de sessions a disparu du
 * produit (F3.8). Les laisser ici les rendrait modifiables par requête directe.
 */
const UpdateSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  blurb: z.string().min(10).max(500).optional(),
  description: z.string().min(10).max(5000).optional(),
  category: z.string().optional(),
  format: z.string().optional(),
  priceFcfa: z.number().int().min(500).optional(),
  level: z.string().optional(),
  learnPoints: z.array(z.string()).optional(),
  includes: z.array(z.string()).optional(),
  coverS3Key: z.string().optional(),
})

export async function GET(_req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const { courseId } = await params
  const course = await db.course.findUnique({ where: { id: courseId } })
  if (!course) return error('COURSE_NOT_FOUND', 'Cours introuvable', 404)
  if (course.trainerId !== ctx.user.trainerId) return error('NOT_OWNER', 'Non possédé', 403)
  return success(course)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const { courseId } = await params
  const parsed = await parseBody(request, UpdateSchema)
  if (parsed instanceof Response) return parsed

  try {
    const updated = await updateCourse(courseId, ctx.user.trainerId!, ctx.user.id, parsed.data)
    return success(updated)
  } catch (err) {
    // La liste écrite à la main ne connaissait pas `FORMAT_CONTRADICTS_CONTENT`
    // et l'aurait rendu en « Erreur » 500 — le motif exact que le garde-fou des
    // erreurs traduites surveille. La table partagée nomme tout.
    return errorFromException(err)
  }
}
