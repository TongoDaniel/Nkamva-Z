// Lot 1 — T3 : approbation d'une candidature
import { success, requireAdminSubRole, parseBody } from '@/lib/api'
import { approveApplication } from '@/lib/trainer-application-review'
import { reviewError } from '../../errors'
import { z } from 'zod'

const ApproveSchema = z.object({
  expectedUpdatedAt: z.string().min(1),
  // Le nom porté sur la pièce d'identité, saisi par le modérateur qui l'a lue.
  verifiedLegalName: z.string().trim().min(2).max(200),
  commissionRate: z.number().min(0).max(0.5).optional(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  const { applicationId } = await params
  const parsed = await parseBody(request, ApproveSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await approveApplication(applicationId, ctx.user.id, parsed.data))
  } catch (err) {
    return reviewError(err)
  }
}
