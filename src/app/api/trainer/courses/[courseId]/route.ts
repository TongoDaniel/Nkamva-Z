// Lot 4 — Formateur : détail + maj cours
import { success, error, requireTrainer, parseBody, errorFromException } from '@/lib/api'
import { updateCourse } from '@/lib/courses'
import { db } from '@/lib/db'
import { z } from 'zod'
import { textField, wordsField } from '@/lib/text-input'
import { COURSE_FORMAT_VALUES, MAX_COURSE_PRICE_FCFA } from '@/lib/course-rules'

/**
 * Ni `durationSeconds` ni `lessonsCount` : la durée se mesure sur le fichier à
 * la confirmation du téléversement, et le nombre de sessions a disparu du
 * produit (F3.8). Les laisser ici les rendrait modifiables par requête directe.
 */
const UpdateSchema = z.object({
  // Nettoyés avant d'être mesurés : des espaces ne font ni un titre ni une
  // description (m4), une catégorie doit contenir une lettre (m5).
  title: wordsField(3, 200).optional(),
  blurb: textField(10, 500).optional(),
  description: textField(10, 5000).optional(),
  category: wordsField(2, 60).optional(),
  format: z.enum(COURSE_FORMAT_VALUES).optional(),
  // Plancher côté service, comme à la création : il dépend de la destination.
  priceFcfa: z.number().int().min(0).max(MAX_COURSE_PRICE_FCFA).optional(),
  level: z.string().optional(),
  learnPoints: z.array(z.string()).optional(),
  includes: z.array(z.string()).optional(),
  coverS3Key: z.string().optional(),
  /**
   * Changer de destination. Le service refuse en `CIRCUIT_LOCKED` dès que la
   * ressource s'est engagée — publiée, ou achetée une fois.
   */
  circuit: z.enum(['MARKETPLACE', 'COMMUNITY']).optional(),
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
