// Lot 1 — Consulter et corriger sa propre candidature
import { z } from 'zod'
import { httpUrlField } from '@/lib/text-input'
import { success, error, requireAuth, parseBody, errorFromException } from '@/lib/api'
import { getMyApplication, updateApplication } from '@/lib/trainer-applications'

export async function GET() {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const application = await getMyApplication(ctx.user.id)
  if (!application) return error('APPLICATION_NOT_FOUND', 'Aucune candidature', 404)
  return success(application)
}

// Mêmes bornes que la création : un champ refusé à l'ouverture du dossier ne
// doit pas passer par la porte de la correction.
const UpdateSchema = z.object({
  slogan: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  // http ou https seulement : `url()` acceptait `javascript:alert(1)`, rendu
  // ensuite en lien sur l'écran de modération (m2).
  websiteUrl: httpUrlField(500).optional(),
  domains: z.array(z.string().max(60)).max(10).optional(),
  experienceYears: z.number().int().min(0).max(80).optional(),
  desiredCadence: z.enum(['MONTHLY', 'YEARLY']).optional(),
})

/**
 * `requireAuth` et non `requireLearner` : le candidat est passé PENDING_TRAINER
 * dès la soumission, et c'est précisément dans cet état qu'il revient corriger
 * son dossier quand la modération lui rend des pièces. Le service referme la
 * fenêtre sur les statuts non modifiables.
 */
export async function PATCH(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const parsed = await parseBody(request, UpdateSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await updateApplication(ctx.user.id, parsed.data))
  } catch (err) {
    return errorFromException(err)
  }
}
