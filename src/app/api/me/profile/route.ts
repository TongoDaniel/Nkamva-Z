// Profil : consultation et mise à jour
import { success, error, requireAuth, parseBody } from '@/lib/api'
import { getProfile, updateProfile } from '@/lib/profile'
import { z } from 'zod'

const UpdateSchema = z.object({
  fullName: z.string().trim().min(2, 'Nom trop court').max(120).optional(),
  preferredName: z.string().trim().max(80).nullable().optional(),
  // Format international, seul commun aux opérateurs mobile money visés.
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ]{6,20}$/, 'Numéro invalide')
    .nullable()
    .optional()
    .or(z.literal('')),
  countryCode: z.string().trim().length(2, 'Code pays sur 2 lettres').toUpperCase().nullable().optional().or(z.literal('')),
  bio: z.string().trim().max(1000, 'Bio trop longue').nullable().optional(),
})

export async function GET() {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const profile = await getProfile(ctx.user.id)
  if (!profile) return error('USER_NOT_FOUND', 'Compte introuvable', 404)
  return success(profile)
}

export async function PATCH(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const parsed = await parseBody(request, UpdateSchema)
  if (parsed instanceof Response) return parsed

  const profile = await updateProfile(ctx.user.id, parsed.data)
  return success(profile)
}
