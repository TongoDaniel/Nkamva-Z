// Lot 0 — Réinitialisation du mot de passe par code à usage unique
import { success, error, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/password'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { checkOtp, consumeOtp, OTP_ERROR_MESSAGES } from '@/lib/otp'
import { auditStandalone } from '@/lib/audit'
import { z } from 'zod'

const ResetSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().regex(/^\d{6}$/, 'Le code comporte 6 chiffres'),
  password: z
    .string()
    .min(8, 'Au moins 8 caractères')
    .regex(/[A-Z]/, 'Au moins une majuscule')
    .regex(/\d/, 'Au moins un chiffre'),
})

export async function POST(request: Request) {
  const identifier = getRateLimitIdentifier(null, request)
  const limit = checkRateLimit(identifier, 'otp-verify', RATE_LIMITS.OTP_VERIFY.max, RATE_LIMITS.OTP_VERIFY.windowMs)
  if (!limit.allowed) {
    return error('RATE_LIMITED', `Trop de tentatives. Réessayez dans ${limit.retryAfter} s.`, 429)
  }

  const parsed = await parseBody(request, ResetSchema)
  if (parsed instanceof Response) return parsed
  const { email, code, password } = parsed.data

  const result = await checkOtp(email, code)
  if (!result.ok) {
    const reason = result.reason!
    return error(reason, OTP_ERROR_MESSAGES[reason], reason === 'OTP_TOO_MANY_ATTEMPTS' ? 429 : 422)
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, deletedAt: true, suspendedAt: true },
  })
  if (!user || user.deletedAt || user.suspendedAt) {
    return error('OTP_INVALID', OTP_ERROR_MESSAGES.OTP_INVALID, 422)
  }

  // Le code est consommé avant l'écriture : une seule réinitialisation possible.
  if (!(await consumeOtp(result.otpId!))) {
    return error('OTP_ALREADY_USED', 'Ce code a déjà été utilisé.', 409)
  }

  const passwordHash = await hashPassword(password)
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        emailVerifiedAt: new Date(),
        // Invalide toutes les sessions ouvertes : un mot de passe changé doit
        // déconnecter un éventuel attaquant déjà connecté.
        sessionsValidAfter: new Date(),
      },
    })
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: 'LEARNER',
        action: 'PASSWORD_RESET',
        targetType: 'User',
        targetId: user.id,
      },
    })
  })

  await auditStandalone({
    actorId: user.id, actorRole: 'SYSTEM',
    action: 'SESSIONS_INVALIDATED', targetType: 'User', targetId: user.id,
    meta: { cause: 'PASSWORD_RESET' },
  })

  return success({ ok: true })
}
