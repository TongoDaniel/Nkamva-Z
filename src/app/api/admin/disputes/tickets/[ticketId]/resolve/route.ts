// Lot 2 — Réponse de la modération à une contestation de formateur
import { success, requireAdminSubRole, parseBody } from '@/lib/api'
import { resolveSupportTicket } from '@/lib/trainer-disputes'
import { reviewError } from '../../../errors'
import { z } from 'zod'

const ResolveSchema = z.object({
  resolutionNote: z.string().trim().min(10, 'Réponse trop courte').max(2000),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  const { ticketId } = await params
  const parsed = await parseBody(request, ResolveSchema)
  if (parsed instanceof Response) return parsed

  try {
    await resolveSupportTicket(ticketId, ctx.user.id, parsed.data.resolutionNote)
    return success({ ok: true })
  } catch (err) {
    return reviewError(err)
  }
}
