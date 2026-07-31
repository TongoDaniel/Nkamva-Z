// Lot 1 — T3 : approuver (crée TrainerProfile + Wallet, User → TRAINER)
import { z } from 'zod'
import { success, errorFromException, requireAdminSubRole, parseBody } from '@/lib/api'
import { approveApplication, TRAINER_APPLICATION_ERRORS } from '@/lib/trainer-applications'

const ApproveSchema = z.object({
  expectedUpdatedAt: z.string(),
  verifiedLegalName: z.string().min(1),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { id } = await params

  const parsed = await parseBody(request, ApproveSchema)
  if (parsed instanceof Response) return parsed

  try {
    await approveApplication(id, ctx.user.id, new Date(parsed.data.expectedUpdatedAt), parsed.data.verifiedLegalName)
    return success({ approved: true })
  } catch (err) {
    return errorFromException(err, TRAINER_APPLICATION_ERRORS)
  }
}
