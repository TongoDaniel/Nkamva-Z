// Lot 0 — Inscription apprenant
import { success, error, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/password'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { issueOtp } from '@/lib/otp'
import { auditStandalone } from '@/lib/audit'
import { z } from 'zod'

const PASSWORD_RULE = z
  .string()
  .min(8, 'Au moins 8 caractères')
  .regex(/[A-Z]/, 'Au moins une majuscule')
  .regex(/\d/, 'Au moins un chiffre')

const RegisterSchema = z.object({
  fullName: z.string().trim().min(2, 'Nom trop court').max(120),
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide'),
  password: PASSWORD_RULE,
  acceptTerms: z.literal(true, { message: 'Vous devez accepter les CGU' }),
})

export async function POST(request: Request) {
  const identifier = getRateLimitIdentifier(null, request)
  const limit = checkRateLimit(identifier, 'register', RATE_LIMITS.REGISTER.max, RATE_LIMITS.REGISTER.windowMs)
  if (!limit.allowed) {
    return error('RATE_LIMITED', `Trop de tentatives. Réessayez dans ${limit.retryAfter} s.`, 429)
  }

  const parsed = await parseBody(request, RegisterSchema)
  if (parsed instanceof Response) return parsed
  const { fullName, email, password } = parsed.data

  const existing = await db.user.findUnique({ where: { email }, select: { id: true, deletedAt: true } })
  if (existing && !existing.deletedAt) {
    // 409 explicite : l'adresse est de toute façon révélée par le formulaire de
    // connexion, et un message flou empêcherait l'utilisateur de comprendre.
    return error('EMAIL_ALREADY_USED', 'Un compte existe déjà avec cette adresse e-mail.', 409)
  }

  const passwordHash = await hashPassword(password)
  const user = await db.user.create({
    data: { email, fullName, passwordHash, role: 'LEARNER' },
    select: { id: true, email: true, fullName: true },
  })

  await auditStandalone({
    actorId: user.id, actorRole: 'LEARNER',
    action: 'USER_REGISTERED', targetType: 'User', targetId: user.id,
  })

  await issueOtp(
    user.email,
    user.id,
    'Confirmez votre adresse e-mail — NkamVa',
    `Bienvenue sur NkamVa. Voici votre code de vérification :`,
  )

  return success({ id: user.id, email: user.email, emailVerified: false }, undefined, 201)
}
