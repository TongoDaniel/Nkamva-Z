// Lot 0 — Vérification d'un code à usage unique
//
// EMAIL_VERIFICATION : le code est consommé et `User.emailVerifiedAt` est posé.
// PASSWORD_RESET     : le code est seulement contrôlé, jamais consommé — il
//   reste exigé par /api/auth/reset-password, qui le consomme au moment où le
//   mot de passe change. Aucun jeton intermédiaire n'est émis : le secret ne
//   quitte jamais la boîte mail de l'utilisateur.
import { success, error, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { checkOtp, consumeOtp, OTP_ERROR_MESSAGES } from '@/lib/otp'
import { auditStandalone } from '@/lib/audit'
import { z } from 'zod'

const VerifySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().regex(/^\d{6}$/, 'Le code comporte 6 chiffres'),
  purpose: z.enum(['EMAIL_VERIFICATION', 'PASSWORD_RESET']).default('EMAIL_VERIFICATION'),
})

export async function POST(request: Request) {
  const identifier = getRateLimitIdentifier(null, request)
  const limit = checkRateLimit(identifier, 'otp-verify', RATE_LIMITS.OTP_VERIFY.max, RATE_LIMITS.OTP_VERIFY.windowMs)
  if (!limit.allowed) {
    return error('RATE_LIMITED', `Trop de tentatives. Réessayez dans ${limit.retryAfter} s.`, 429)
  }

  const parsed = await parseBody(request, VerifySchema)
  if (parsed instanceof Response) return parsed
  const { email, code, purpose } = parsed.data

  const result = await checkOtp(email, code)
  if (!result.ok) {
    const reason = result.reason!
    return error(reason, OTP_ERROR_MESSAGES[reason], reason === 'OTP_TOO_MANY_ATTEMPTS' ? 429 : 422)
  }

  if (purpose === 'PASSWORD_RESET') {
    return success({ valid: true, consumed: false })
  }

  if (!(await consumeOtp(result.otpId!))) {
    return error('OTP_ALREADY_USED', 'Ce code a déjà été utilisé.', 409)
  }

  if (result.userId) {
    await db.user.updateMany({
      where: { id: result.userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    })
    await auditStandalone({
      actorId: result.userId, actorRole: 'LEARNER',
      action: 'EMAIL_VERIFIED', targetType: 'User', targetId: result.userId,
    })
  }

  return success({ valid: true, consumed: true })
}
