import { z } from 'zod'
import { db } from '@/lib/db'
import { audit, auditStandalone } from '@/lib/audit'
import { success, error, parseBody } from '@/lib/api'
import { hashPassword } from '@/lib/password'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { issueOtp, sendOtpEmail, sendAccountExistsEmail } from '@/lib/otp'
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

  // Réponse uniforme, qu'un compte existe déjà ou non (finding 7 du pentest).
  // Avant, une adresse déjà prise renvoyait 409 : il suffisait d'observer le
  // code HTTP pour énumérer les comptes existants, y compris ceux d'administration.
  // Désormais la réponse est identique dans tous les cas ; c'est l'e-mail — reçu
  // par le seul propriétaire de la boîte — qui distingue les situations.
  const uniformOk = () =>
    success({ email: normalizedEmail, emailVerificationRequired: true }, undefined, 201)

  const existing = await db.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, deletedAt: true },
  })
  if (existing && !existing.deletedAt) {
    // Pas de code émis : on prévient le propriétaire par un e-mail dédié, et on
    // répond le même succès que pour une vraie inscription.
    await sendAccountExistsEmail(normalizedEmail)
    await auditStandalone({
      action: 'REGISTER_EMAIL_IN_USE',
      targetType: 'User',
      targetId: existing.id,
      meta: { email: normalizedEmail },
    })
    return uniformOk()
  }

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
    // Course entre deux inscriptions simultanées : l'index unique sur `email`
    // tranche. Même réponse uniforme que ci-dessus — surtout pas un 409 qui
    // trahirait l'existence de l'adresse.
    if ((err as { code?: string }).code === 'P2002') {
      await sendAccountExistsEmail(normalizedEmail)
      return uniformOk()
    }
    throw err
  }

  const code = await issueOtp(normalizedEmail, userId)
  await sendOtpEmail(normalizedEmail, code)

  return uniformOk()
}
