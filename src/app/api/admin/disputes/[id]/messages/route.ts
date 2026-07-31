// Lot 2 — T2 : poster côté support (bascule OPEN → IN_REVIEW au premier message)
import { z } from 'zod'
import { success, errorFromException, requireAdminSubRole, parseBody } from '@/lib/api'
import { addSupportMessage, DISPUTE_ERRORS } from '@/lib/disputes'

const MessageSchema = z.object({ body: z.string().min(1).max(5000) })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { id } = await params

  const parsed = await parseBody(request, MessageSchema)
  if (parsed instanceof Response) return parsed

  try {
    await addSupportMessage(id, ctx.user.id, parsed.data.body)
    return success({ posted: true }, {}, 201)
  } catch (err) {
    return errorFromException(err, DISPUTE_ERRORS)
  }
}
