// Finances et Super-admin : accorder une réduction (décisions 60 et 62)
// Décision 60 — le Super-admin fixe la grille et remise ; Finances remise, et
// rien d'autre. Les deux passent donc par cette route, la grille non.
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { createDiscount } from '@/lib/pricing'

const CreateSchema = z.object({
  kind: z.enum(['CAMPAIGN', 'TRAINER', 'PROMO_CODE']),
  label: z.string().min(3).max(200),
  amountFcfa: z.number().int().positive(),
  code: z.string().min(3).max(40).optional(),
  trainerId: z.string().uuid().optional(),
  reason: z.string().max(1000).optional(),
  validFrom: z.string(),
  validUntil: z.string().optional(),
  maxUses: z.number().int().positive().optional(),
})

export async function POST(request: Request) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx

  const parsed = await parseBody(request, CreateSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(
      await createDiscount({
        ...parsed.data,
        validFrom: new Date(parsed.data.validFrom),
        validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : null,
        actorId: ctx.user.id,
        actorRole: ctx.user.adminRole ?? 'FINANCES',
      }),
      undefined,
      201,
    )
  } catch (err) {
    return errorFromException(err)
  }
}
