import { z } from 'zod'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { success, error, parseBody } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { consumeOtp } from '@/lib/otp'
import { otpFailureResponse } from '../otp-errors'

const schema = z.object({
  email: z.string().email('Adresse email invalide').max(254),
  code: z.string().regex(/^\d{6}$/, 'Code à 6 chiffres attendu'),
})

/** Vérification de l'adresse email après inscription. */
export async function POST(request: Request) {
  const parsed = await parseBody(request, schema)
  if (parsed instanceof Response) return parsed
  const email = parsed.data.email.toLowerCase()

  const identifier = `${getRateLimitIdentifier(null, request)}:${email}`
  const limit = checkRateLimit(identifier, 'OTP_VERIFY', RATE_LIMITS.OTP_VERIFY.max, RATE_LIMITS.OTP_VERIFY.windowMs)
  if (!limit.allowed) {
    return error('RATE_LIMITED', `Trop de tentatives. Réessayez dans ${limit.retryAfter} secondes.`, 429)
  }

  const result = await consumeOtp(email, parsed.data.code)
  if (!result.ok) return otpFailureResponse(result.reason)

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, emailVerifiedAt: true, deletedAt: true },
  })
  if (!user || user.deletedAt) return error('USER_NOT_FOUND', 'Compte introuvable', 404)

  if (!user.emailVerifiedAt) {
    await db.$transaction(async tx => {
      await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } })
      await audit(tx, {
        actorId: user.id,
        actorRole: 'LEARNER',
        action: 'EMAIL_VERIFIED',
        targetType: 'User',
        targetId: user.id,
        meta: { email },
      })
    })
  }

  return success({ verified: true })
}
