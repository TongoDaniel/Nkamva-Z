import { z } from 'zod'
import { db } from '@/lib/db'
import { success, error, parseBody } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { issueOtp, sendOtpEmail } from '@/lib/otp'

const schema = z.object({
  email: z.string().email('Adresse email invalide').max(254),
  // L'usage décide quel code est émis ; un code d'un usage ne vaut pas pour
  // l'autre. Le front le passe déjà (verifier-code / mot-de-passe-oublié) ;
  // par défaut, vérification d'adresse.
  purpose: z.enum(['EMAIL_VERIFICATION', 'PASSWORD_RESET']).default('EMAIL_VERIFICATION'),
})

/**
 * Demande d'envoi d'un code à usage unique (vérification d'email ou mot de passe oublié).
 * Réponse volontairement identique que le compte existe ou non : pas d'énumération.
 */
export async function POST(request: Request) {
  const parsed = await parseBody(request, schema)
  if (parsed instanceof Response) return parsed
  const email = parsed.data.email.toLowerCase()

  const identifier = `${getRateLimitIdentifier(null, request)}:${email}`
  const limit = checkRateLimit(identifier, 'OTP_REQUEST', RATE_LIMITS.OTP_REQUEST.max, RATE_LIMITS.OTP_REQUEST.windowMs)
  if (!limit.allowed) {
    return error('RATE_LIMITED', `Trop de demandes. Réessayez dans ${limit.retryAfter} secondes.`, 429)
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, deletedAt: true, suspendedAt: true },
  })

  if (user && !user.deletedAt && !user.suspendedAt) {
    const code = await issueOtp(email, user.id, parsed.data.purpose)
    await sendOtpEmail(email, code)
  }

  return success({ sent: true, expiresInSeconds: 600 })
}
