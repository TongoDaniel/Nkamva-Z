// Lot 2 — Formateur : contester un litige (crée un SupportTicket)
import { z } from 'zod'
import { success, errorFromException, requireTrainer, parseBody } from '@/lib/api'
import { contestDispute, DISPUTE_ERRORS } from '@/lib/disputes'

const ContestSchema = z.object({ reason: z.string().min(1).max(5000), attachments: z.array(z.string()).optional() })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const { id } = await params

  const parsed = await parseBody(request, ContestSchema)
  if (parsed instanceof Response) return parsed

  try {
    const ticket = await contestDispute(id, ctx.user.id, parsed.data.reason, parsed.data.attachments)
    return success(ticket, {}, 201)
  } catch (err) {
    return errorFromException(err, DISPUTE_ERRORS)
  }
}
