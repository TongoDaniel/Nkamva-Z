// Lot 0 — Inscription apprenant (email + mot de passe argon2id)
import { z } from 'zod'
import { success, error, parseBody } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/password'
import { auditStandalone } from '@/lib/audit'

const RegisterSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(200),
  fullName: z.string().min(1).max(120).optional(),
})

export async function POST(request: Request) {
  const limit = checkRateLimit(
    getRateLimitIdentifier(null, request), 'REGISTER',
    RATE_LIMITS.REGISTER.max, RATE_LIMITS.REGISTER.windowMs,
  )
  if (!limit.allowed) return error('RATE_LIMITED', 'Trop de tentatives, réessayez plus tard', 429)

  const parsed = await parseBody(request, RegisterSchema)
  if (parsed instanceof Response) return parsed

  const email = parsed.data.email.toLowerCase()

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) return error('EMAIL_ALREADY_USED', 'Un compte existe déjà avec cet email', 409)

  const passwordHash = await hashPassword(parsed.data.password)

  const user = await db.user.create({
    data: { email, passwordHash, fullName: parsed.data.fullName ?? null, role: 'LEARNER' },
    select: { id: true, email: true, fullName: true, role: true, createdAt: true },
  })

  await auditStandalone({
    actorId: user.id, actorRole: 'LEARNER',
    action: 'USER_REGISTERED', targetType: 'User', targetId: user.id,
    meta: { email },
  })

  return success(user, undefined, 201)
}
