// Lot 1 — Consultation et mise à jour de sa propre candidature
import { success, error, requireAuth, parseBody } from '@/lib/api'
import { getMyApplication, updateApplication, missingDocuments } from '@/lib/trainer-applications'
import { applicationError } from '../errors'
import { z } from 'zod'

const UpdateSchema = z.object({
  slogan: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().min(50).max(2000).optional(),
  websiteUrl: z.string().trim().url('Adresse invalide').max(300).nullable().optional().or(z.literal('')),
  domains: z.array(z.string().trim().min(1)).min(1).max(5).optional(),
  experienceYears: z.number().int().min(0).max(70).nullable().optional(),
})

export async function GET() {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const application = await getMyApplication(ctx.user.id)
  if (!application) return error('APPLICATION_NOT_FOUND', 'Aucune candidature en cours.', 404)

  // Le front a besoin de savoir ce qui bloque encore la soumission.
  const missing = await missingDocuments(application.id)
  return success({ ...application, missingDocuments: missing })
}

export async function PATCH(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const parsed = await parseBody(request, UpdateSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await updateApplication(ctx.user.id, parsed.data))
  } catch (err) {
    return applicationError(err)
  }
}
