// Super-admin — changer le sous-rôle d'un administrateur, ou lui retirer ses droits
//
// Les deux verbes refusent tout ce qui touche à `SUPER_ADMIN` — le prendre
// pour cible ou le viser comme nouveau sous-rôle — sans exception d'acteur :
// c'est le garde-fou qui empêche de fermer la console à tout le monde d'un
// clic. Voir `src/lib/admins.ts`.
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { changeAdminRole, revokeAdmin } from '@/lib/admins'

const ChangeRoleSchema = z.object({
  adminRole: z.enum(['FINANCES', 'MODERATION']),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const ctx = await requireAdminSubRole('SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { userId } = await params

  const parsed = await parseBody(request, ChangeRoleSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await changeAdminRole(userId, parsed.data.adminRole, ctx.user.id))
  } catch (err) {
    return errorFromException(err)
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const ctx = await requireAdminSubRole('SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { userId } = await params

  try {
    await revokeAdmin(userId, ctx.user.id)
    return success({ revoked: true })
  } catch (err) {
    return errorFromException(err)
  }
}
