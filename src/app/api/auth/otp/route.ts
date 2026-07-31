// Lot 0 — Demande d'un code à usage unique (vérification e-mail ou mot de passe oublié)
import { success, error, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { issueOtp, OTP_TTL_SECONDS } from '@/lib/otp'
import { z } from 'zod'

const OtpSchema = z.object({
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide'),
  purpose: z.enum(['EMAIL_VERIFICATION', 'PASSWORD_RESET']).default('EMAIL_VERIFICATION'),
})

const COPY = {
  EMAIL_VERIFICATION: {
    subject: 'Confirmez votre adresse e-mail — NkamVa',
    intro: 'Voici votre code de vérification :',
  },
  PASSWORD_RESET: {
    subject: 'Réinitialisation de votre mot de passe — NkamVa',
    intro: 'Voici le code pour réinitialiser votre mot de passe :',
  },
} as const

export async function POST(request: Request) {
  const identifier = getRateLimitIdentifier(null, request)
  const limit = checkRateLimit(identifier, 'otp-request', RATE_LIMITS.OTP_REQUEST.max, RATE_LIMITS.OTP_REQUEST.windowMs)
  if (!limit.allowed) {
    return error('RATE_LIMITED', `Trop de demandes de code. Réessayez dans ${limit.retryAfter} s.`, 429)
  }

  const parsed = await parseBody(request, OtpSchema)
  if (parsed instanceof Response) return parsed
  const { email, purpose } = parsed.data

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, deletedAt: true, suspendedAt: true },
  })

  // Réponse identique que le compte existe ou non : pas d'énumération d'adresses.
  if (user && !user.deletedAt && !user.suspendedAt) {
    await issueOtp(email, user.id, COPY[purpose].subject, COPY[purpose].intro)
  }

  return success({ sent: true, expiresInSeconds: OTP_TTL_SECONDS })
}
