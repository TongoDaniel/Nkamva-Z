// Enregistre la position de lecture d'une ressource achetée (F3.1)
//
// La route ne connaissait que `watchedSeconds`, et donc que la vidéo : un PDF
// n'avait aucune position, et un kit aucun repère. Elle accepte désormais les
// trois formes — une seconde, une page, un marqueur — et laisse le service
// décider laquelle a un sens pour le format concerné, et dans quelles bornes.
import { success, requireAuth, parseBody, errorFromException, error } from '@/lib/api'
import { updateReadingPosition } from '@/lib/access'
import { z } from 'zod'

const ProgressSchema = z
  .object({
    /** Vidéo. Le plafond est celui d'une journée : le serveur borne ensuite à la durée réelle. */
    watchedSeconds: z.number().int().min(0).max(86_400).optional(),
    /** Document. Borné ensuite au nombre de pages mesuré au dépôt. */
    lastPage: z.number().int().min(1).max(100_000).optional(),
    /** Archive. Le marqueur « terminé », posé et retiré par l'apprenant. */
    completed: z.boolean().optional(),
  })
  .strict()

export async function POST(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const { courseId } = await params
  const parsed = await parseBody(request, ProgressSchema)
  if (parsed instanceof Response) return parsed

  // Un corps vide n'est pas une position : le dire vaut mieux que de toucher
  // `lastViewedAt` pour rien.
  const { watchedSeconds, lastPage, completed } = parsed.data
  if (watchedSeconds === undefined && lastPage === undefined && completed === undefined) {
    return error('VALIDATION_ERROR', 'Aucune position transmise.', 400)
  }

  try {
    await updateReadingPosition(courseId, ctx.user.id, { watchedSeconds, lastPage, completed })
    return success({ ok: true })
  } catch (err) {
    // La liste écrite à la main ignorait `COURSE_NOT_FOUND` et l'aurait rendu
    // en « Erreur » 500 : la table partagée nomme tout.
    return errorFromException(err)
  }
}
