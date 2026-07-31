// Lot 3 — PM2/PM3 : vérifier (MANUAL_FINANCE ou MICRO_DEPOSIT)
import { z } from 'zod'
import { success, errorFromException, requireAdminSubRole, parseBody } from '@/lib/api'
import { verifyPayoutMethod, PAYOUT_METHOD_ERRORS } from '@/lib/payout-methods'

const VerifySchema = z.object({ verificationMethod: z.enum(['MANUAL_FINANCE', 'MICRO_DEPOSIT']) })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { id } = await params

  const parsed = await parseBody(request, VerifySchema)
  if (parsed instanceof Response) return parsed

  try {
    await verifyPayoutMethod(id, ctx.user.id, parsed.data.verificationMethod)
    return success({ verified: true })
  } catch (err) {
    return errorFromException(err, PAYOUT_METHOD_ERRORS)
  }
}
