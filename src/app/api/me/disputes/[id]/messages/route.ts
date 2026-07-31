// Lot 2 — T4 : poster un message (apprenant)
import { z } from 'zod'
import { success, errorFromException, requireAuth, parseBody } from '@/lib/api'
import { addLearnerMessage, DISPUTE_ERRORS } from '@/lib/disputes'

const MessageSchema = z.object({ body: z.string().min(1).max(5000) })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx
  const { id } = await params

  const parsed = await parseBody(request, MessageSchema)
  if (parsed instanceof Response) return parsed

  try {
    await addLearnerMessage(id, ctx.user.id, parsed.data.body)
    return success({ posted: true }, {}, 201)
  } catch (err) {
    return errorFromException(err, DISPUTE_ERRORS)
  }
}
