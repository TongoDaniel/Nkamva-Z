import { z } from 'zod'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { success, error, parseBody } from '@/lib/api'
import { hashPassword } from '@/lib/password'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { issueOtp, sendOtpEmail } from '@/lib/otp'
import { MIN_PASSWORD_LENGTH } from '@/lib/validation'

const schema = z.object({
  email: z.string().email('Adresse email invalide').max(254),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères`).max(128),
  fullName: z.string().trim().min(2, 'Nom complet requis').max(120),
  countryCode: z.string().trim().length(2).optional(),
})

export async function POST(request: Request) {
  const identifier = getRateLimitIdentifier(null, request)
  const limit = checkRateLimit(identifier, 'REGISTER', RATE_LIMITS.REGISTER.max, RATE_LIMITS.REGISTER.windowMs)
  if (!limit.allowed) {
    return error('RATE_LIMITED', `Trop de tentatives. Réessayez dans ${limit.retryAfter} secondes.`, 429)
  }

  const parsed = await parseBody(request, schema)
  if (parsed instanceof Response) return parsed
  const { email, password, fullName, countryCode } = parsed.data
  const normalizedEmail = email.toLowerCase()

  const existing = await db.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } })
  if (existing) return error('EMAIL_ALREADY_USED', 'Un compte existe déjà avec cette adresse email', 409)

  const passwordHash = await hashPassword(password)

  let userId: string
  try {
    userId = await db.$transaction(async tx => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          fullName,
          countryCode: countryCode?.toUpperCase() ?? null,
          role: 'LEARNER',
        },
        select: { id: true },
      })
      await audit(tx, {
        actorId: user.id,
        actorRole: 'LEARNER',
        action: 'USER_REGISTERED',
        targetType: 'User',
        targetId: user.id,
        meta: { email: normalizedEmail },
      })
      return user.id
    })
  } catch (err) {
    // Course entre deux inscriptions simultanées : l'index unique sur `email` tranche.
    if ((err as { code?: string }).code === 'P2002') {
      return error('EMAIL_ALREADY_USED', 'Un compte existe déjà avec cette adresse email', 409)
    }
    throw err
  }

  const code = await issueOtp(normalizedEmail, userId, 'EMAIL_VERIFICATION')
  await sendOtpEmail(normalizedEmail, code)

  return success({ userId, email: normalizedEmail, emailVerificationRequired: true }, undefined, 201)
}
