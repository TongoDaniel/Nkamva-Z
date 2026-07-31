// Lot 4 — Fiche cours publique
import { success, error } from '@/lib/api'
import { getPublicCourse } from '@/lib/catalog'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const course = await getPublicCourse(slug)
  if (!course) return error('COURSE_NOT_FOUND', 'Cours introuvable', 404)
  return success(course)
}
