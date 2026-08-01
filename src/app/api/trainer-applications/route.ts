// Lot 1 — Créer une candidature formateur (T1)
import { z } from 'zod'
import { success, requireAuth, parseBody, errorFromException } from '@/lib/api'
import { createApplication } from '@/lib/trainer-applications'

const CreateSchema = z.object({
  slogan: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  websiteUrl: z.string().url().max(500).optional(),
  domains: z.array(z.string().max(60)).max(10).optional(),
  experienceYears: z.number().int().min(0).max(80).optional(),
})

export async function POST(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const parsed = await parseBody(request, CreateSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await createApplication(ctx.user.id, parsed.data), undefined, 201)
  } catch (err) {
    return errorFromException(err)
  }
}
