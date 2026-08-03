// Signalement d'un contenu par un utilisateur connecté (décision 7)
import { z } from 'zod'
import { success, error, requireAuth, parseBody, errorFromException } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { createReport } from '@/lib/reports'

const CreateSchema = z.object({
  targetType: z.enum(['COURSE', 'USER', 'COMMUNITY', 'MESSAGE', 'DISPUTE_MESSAGE']),
  targetId: z.string().uuid(),
  reason: z.enum(['ILLEGAL', 'MISLEADING', 'HARASSMENT', 'SPAM', 'INTELLECTUAL_PROPERTY', 'OTHER']),
  detail: z.string().max(2000).optional(),
})

export async function POST(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  // Un signalement coûte du temps de modération : on limite le débit, sinon
  // un compte seul peut saturer la file.
  const limit = checkRateLimit(
    getRateLimitIdentifier(ctx.user, request), 'REPORT_CREATE',
    RATE_LIMITS.REPORT_CREATE.max, RATE_LIMITS.REPORT_CREATE.windowMs,
  )
  if (!limit.allowed) return error('RATE_LIMITED', 'Trop de signalements, réessayez plus tard', 429)

  const parsed = await parseBody(request, CreateSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await createReport(ctx.user.id, parsed.data), undefined, 201)
  } catch (err) {
    return errorFromException(err)
  }
}
