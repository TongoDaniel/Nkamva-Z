// Lot 4 — Formateur : CRUD cours
import { success, error, requireTrainer, parseBody } from '@/lib/api'
import { createCourse, listTrainerCourses, updateCourse } from '@/lib/courses'
import { z } from 'zod'

const CreateSchema = z.object({
  title: z.string().min(3).max(200),
  blurb: z.string().min(10).max(500),
  description: z.string().min(10).max(5000),
  category: z.string().min(1),
  format: z.string().min(1),
  priceFcfa: z.number().int().min(500),
  level: z.string().optional(),
  durationSeconds: z.number().int().optional(),
  lessonsCount: z.number().int().optional(),
  learnPoints: z.array(z.string()).optional(),
  includes: z.array(z.string()).optional(),
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
  } catch (err: any) {
    if (err.message === 'PRICE_TOO_LOW') return error('PRICE_TOO_LOW', 'Prix minimum 500 FCFA', 400)
    return error('INTERNAL_ERROR', 'Erreur', 500)
  }
}
