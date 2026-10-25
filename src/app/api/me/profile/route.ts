// Profil : consultation et mise à jour
import { success, error, requireAuth, parseBody } from '@/lib/api'
import { getProfile, updateProfile } from '@/lib/profile'
import { z } from 'zod'
import { countryCodeField, textField, wordsField } from '@/lib/text-input'

const UpdateSchema = z.object({
  // Nettoyés avant d'être mesurés : ni caractères invisibles, ni inversion du
  // sens d'affichage (m15).
  fullName: wordsField(2, 120).optional(),
  preferredName: textField(0, 80).nullable().optional(),
  // Format international, seul commun aux opérateurs mobile money visés.
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ]{6,20}$/, 'Numéro invalide')
    .nullable()
    .optional()
    .or(z.literal('')),
  countryCode: countryCodeField().nullable().optional().or(z.literal('')),
  bio: z.string().trim().max(1000, 'Bio trop longue').nullable().optional(),
  // Préférence d'envoi, pas une donnée de profil : elle passe par la même route
  // parce qu'elle vit sur le même enregistrement et suit le même audit.
  subscriptionNoticeEmails: z.boolean().optional(),
  relationalEmails: z.boolean().optional(),
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
