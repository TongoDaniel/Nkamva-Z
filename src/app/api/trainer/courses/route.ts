// Lot 4 — Formateur : CRUD cours
import { success, requireTrainer, parseBody, errorFromException } from '@/lib/api'
import { createCourse, listTrainerCourses, updateCourse } from '@/lib/courses'
import { z } from 'zod'
import { textField, wordsField } from '@/lib/text-input'
import { COURSE_FORMAT_VALUES, MAX_COURSE_PRICE_FCFA } from '@/lib/course-rules'

/**
 * Voir la route de détail : la durée se mesure, le nombre de sessions n'est
 * plus (F3.8).
 *
 * `priceFcfa` descend à 0 ici, et ce n'est pas un relâchement : le plancher
 * dépend désormais de la **destination**, et c'est le service qui le sait. Une
 * ressource incluse dans une communauté ne se vend pas à l'unité, son prix est
 * écrit à 0, et un `min(500)` dans ce schéma aurait refusé la création avant
 * même que la règle soit consultée. Le refus `PRICE_TOO_LOW` vient du service.
 */
const CreateSchema = z.object({
  // Nettoyés avant d'être mesurés : des espaces ne font ni un titre ni une
  // description (m4), une catégorie doit contenir une lettre (m5).
  title: wordsField(3, 200),
  blurb: textField(10, 500),
  description: textField(10, 5000),
  category: wordsField(2, 60),
  format: z.enum(COURSE_FORMAT_VALUES),
  priceFcfa: z.number().int().min(0).max(MAX_COURSE_PRICE_FCFA),
  level: z.string().optional(),
  learnPoints: z.array(z.string()).optional(),
  includes: z.array(z.string()).optional(),
  circuit: z.enum(['MARKETPLACE', 'COMMUNITY']).optional(),
})

export async function GET(request: Request) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const url = new URL(request.url)
  const status = url.searchParams.get('status') || undefined
  const courses = await listTrainerCourses(ctx.user.trainerId!, status)
  return success(courses)
}

export async function POST(request: Request) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const parsed = await parseBody(request, CreateSchema)
  if (parsed instanceof Response) return parsed

  try {
    const course = await createCourse(ctx.user.trainerId!, ctx.user.id, parsed.data)
    return success(course, {}, 201)
  } catch (err) {
    // Tous les refus passent par la table partagée : `PRICE_TOO_LOW`, qui était
    // traduit ici à la main avec son montant recopié, mais aussi
    // `SUBSCRIPTION_SUSPENDED` (décision 68) et, depuis que la destination se
    // choisit, `COMMUNITY_NOT_FOUND` et `COMMUNITY_RESOURCES_DISABLED`.
    return errorFromException(err)
  }
}
