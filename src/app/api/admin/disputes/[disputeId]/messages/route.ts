// Lot 2 — T2 : message du support dans le fil
import { success, requireAdminSubRole, parseBody } from '@/lib/api'
import { postSupportMessage } from '@/lib/dispute-review'
import { DISPUTE_MESSAGE_MAX_LENGTH } from '@/lib/disputes'
import { reviewError } from '../../errors'
import { z } from 'zod'

const MessageSchema = z.object({
  body: z.string().trim().min(1, 'Message vide').max(DISPUTE_MESSAGE_MAX_LENGTH),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ disputeId: string }> },
) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  const { disputeId } = await params
  const parsed = await parseBody(request, MessageSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await postSupportMessage(disputeId, ctx.user.id, parsed.data.body), {}, 201)
  } catch (err) {
    return reviewError(err)
  }
}
