// Changement de mot de passe depuis un compte connecté
import { success, error, requireAuth, parseBody } from '@/lib/api'
import { changePassword, type PasswordChangeFailure } from '@/lib/profile'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { z } from 'zod'

const ChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
  newPassword: z
    .string()
    .min(8, 'Au moins 8 caractères')
    .regex(/[A-Z]/, 'Au moins une majuscule')
    .regex(/\d/, 'Au moins un chiffre'),
})

const MESSAGES: Record<PasswordChangeFailure, { message: string; status: number }> = {
  NO_PASSWORD_SET: {
    message: "Ce compte n'a pas de mot de passe. Utilisez « mot de passe oublié » pour en définir un.",
    status: 422,
  },
  CURRENT_PASSWORD_INVALID: { message: 'Mot de passe actuel incorrect.', status: 422 },
  SAME_PASSWORD: { message: 'Le nouveau mot de passe doit être différent de l\'actuel.', status: 422 },
}

export async function POST(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  // Limité comme une connexion : la route vérifie un mot de passe.
  const identifier = getRateLimitIdentifier({ id: ctx.user.id }, request)
  const limit = checkRateLimit(identifier, 'password-change', RATE_LIMITS.LOGIN.max, RATE_LIMITS.LOGIN.windowMs)
  if (!limit.allowed) {
    return error('RATE_LIMITED', `Trop de tentatives. Réessayez dans ${limit.retryAfter} s.`, 429)
  }

  const parsed = await parseBody(request, ChangeSchema)
  if (parsed instanceof Response) return parsed

  const result = await changePassword(ctx.user.id, parsed.data.currentPassword, parsed.data.newPassword)
  if (!result.ok) {
    const { message, status } = MESSAGES[result.reason]
    return error(result.reason, message, status)
  }

  // Toutes les sessions sont invalidées, celle en cours comprise : le client
  // doit se reconnecter.
  return success({ ok: true, sessionsInvalidated: true })
}
