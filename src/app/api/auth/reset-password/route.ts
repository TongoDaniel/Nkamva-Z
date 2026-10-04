import { z } from 'zod'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { success, error, parseBody } from '@/lib/api'
import { hashPassword } from '@/lib/password'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { consumeOtp } from '@/lib/otp'
import { otpFailureResponse } from '../otp-errors'
import { MIN_PASSWORD_LENGTH } from '@/lib/validation'
import { isBreachedPassword, BREACHED_PASSWORD_MESSAGE } from '@/lib/breached-password'

const schema = z.object({
  email: z.string().email('Adresse email invalide').max(254),
  code: z.string().regex(/^\d{6}$/, 'Code à 6 chiffres attendu'),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères`).max(128),
})

export async function POST(request: Request) {
  const parsed = await parseBody(request, schema)
  if (parsed instanceof Response) return parsed
  const email = parsed.data.email.toLowerCase()

  const identifier = `${getRateLimitIdentifier(null, request)}:${email}`
  const limit = checkRateLimit(identifier, 'OTP_VERIFY', RATE_LIMITS.OTP_VERIFY.max, RATE_LIMITS.OTP_VERIFY.windowMs)
  if (!limit.allowed) {
    return error('RATE_LIMITED', `Trop de tentatives. Réessayez dans ${limit.retryAfter} secondes.`, 429)
  }

  // Avant de consommer le code : un mot de passe refusé ne doit pas obliger à
  // en redemander un.
  if (await isBreachedPassword(parsed.data.password)) {
    return error('PASSWORD_BREACHED', BREACHED_PASSWORD_MESSAGE, 422)
  }

  const result = await consumeOtp(email, parsed.data.code, 'PASSWORD_RESET')
  if (!result.ok) return otpFailureResponse(result.reason)

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, role: true, deletedAt: true, suspendedAt: true },
  })
  if (!user || user.deletedAt) return error('USER_NOT_FOUND', 'Compte introuvable', 404)
  if (user.suspendedAt) return error('ACCOUNT_SUSPENDED', 'Compte suspendu', 403)

  const passwordHash = await hashPassword(parsed.data.password)

  const now = new Date()

  await db.$transaction(async tx => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        // Invalidation ciblée : toutes les sessions ouvertes tombent.
        sessionsValidAfter: now,
        emailVerifiedAt: now,
      },
    })
    await audit(tx, {
      actorId: user.id,
      actorRole: user.role,
      action: 'PASSWORD_RESET',
      targetType: 'User',
      targetId: user.id,
      meta: { email },
    })
  })

  return success({ reset: true })
}
