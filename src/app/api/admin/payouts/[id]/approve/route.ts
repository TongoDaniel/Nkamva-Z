// Lot 3 — P4 : approuver (re-vérification solde + KYC)
import { z } from 'zod'
import { success, errorFromException, requireAdminSubRole, parseBody } from '@/lib/api'
import { approvePayout, PAYOUT_ERRORS } from '@/lib/payouts'

const ApproveSchema = z.object({ expectedUpdatedAt: z.string() })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { id } = await params

  const parsed = await parseBody(request, ApproveSchema)
  if (parsed instanceof Response) return parsed

  try {
    await approvePayout(id, ctx.user.id, new Date(parsed.data.expectedUpdatedAt))
    return success({ approved: true })
  } catch (err) {
    return errorFromException(err, PAYOUT_ERRORS)
  }
}
