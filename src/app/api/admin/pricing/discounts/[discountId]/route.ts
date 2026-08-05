// Finances et Super-admin : clore une réduction (décisions 60 et 62)
//
// `endDiscount` existait sans route : une remise posée ne pouvait plus être
// arrêtée avant son terme naturel. Même périmètre d'acteurs que la création.
import { success, requireAdminSubRole, errorFromException } from '@/lib/api'
import { endDiscount } from '@/lib/pricing'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ discountId: string }> },
) {
  const ctx = await requireAdminSubRole('FINANCES', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { discountId } = await params

  try {
    return success(await endDiscount(discountId, ctx.user.id, ctx.user.adminRole ?? 'FINANCES'))
  } catch (err) {
    return errorFromException(err)
  }
}
