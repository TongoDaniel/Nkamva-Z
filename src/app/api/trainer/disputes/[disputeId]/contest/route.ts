// Lot 2 — Le formateur apporte des éléments au dossier
//
// La contestation ne rejoint pas le fil du litige : elle prend la forme d'un
// SupportTicket, que l'apprenant ne voit pas. La confidentialité vaut dans les
// deux sens — il ne voit pas le détail du motif, l'apprenant ne voit pas sa
// défense.
import { success, error, requireTrainer, parseBody } from '@/lib/api'
import { contestDispute, CONTEST_MAX_LENGTH } from '@/lib/trainer-disputes'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { disputeError } from '@/app/api/me/disputes/errors'
import { z } from 'zod'

const ContestSchema = z.object({
  reason: z.string().trim().min(20, 'Détaillez les éléments apportés').max(CONTEST_MAX_LENGTH),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ disputeId: string }> },
) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx

  const identifier = getRateLimitIdentifier({ id: ctx.user.id }, request)
  const limit = checkRateLimit(identifier, 'dispute-contest', RATE_LIMITS.DISPUTE_MESSAGE.max, RATE_LIMITS.DISPUTE_MESSAGE.windowMs)
  if (!limit.allowed) {
    return error('RATE_LIMITED', `Trop de contestations. Réessayez dans ${limit.retryAfter} s.`, 429)
  }

  const { disputeId } = await params
  const parsed = await parseBody(request, ContestSchema)
  if (parsed instanceof Response) return parsed

  try {
    const ticket = await contestDispute(disputeId, ctx.user.id, ctx.user.trainerId!, parsed.data.reason)
    return success(ticket, {}, 201)
  } catch (err) {
    return disputeError(err)
  }
}
