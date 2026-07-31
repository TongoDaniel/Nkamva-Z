// Lot 1 — T1 : création d'une candidature formateur
import { success, requireAuth, parseBody } from '@/lib/api'
import { createApplication } from '@/lib/trainer-applications'
import { applicationError } from './errors'
import { z } from 'zod'

const CreateSchema = z.object({
  slogan: z.string().trim().max(120).optional(),
  description: z.string().trim().min(50, 'Présentez votre expertise en quelques lignes').max(2000),
  websiteUrl: z.string().trim().url('Adresse invalide').max(300).optional().or(z.literal('')),
  domains: z.array(z.string().trim().min(1)).min(1, 'Indiquez au moins un domaine').max(5),
  experienceYears: z.number().int().min(0).max(70).optional(),
})

export async function POST(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const parsed = await parseBody(request, CreateSchema)
  if (parsed instanceof Response) return parsed

  try {
    const application = await createApplication(ctx.user.id, parsed.data)
    return success(application, {}, 201)
  } catch (err) {
    return applicationError(err)
  }
}
