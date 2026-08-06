// Super-admin — changer le sous-rôle d'un administrateur, fermer son compte,
// ou le rouvrir.
//
// Les trois verbes refusent tout ce qui touche à `SUPER_ADMIN` — le prendre
// pour cible ou le viser comme nouveau sous-rôle — sans exception d'acteur :
// c'est le garde-fou qui empêche de fermer la console à tout le monde d'un
// clic. Voir `src/lib/admins.ts`.
//
// DELETE ferme, POST rouvre. Fermer ne rétrograde personne (arbitrage 88) : le
// compte reste administrateur, il cesse seulement de pouvoir se connecter.
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { changeAdminRole, deactivateAdmin, reactivateAdmin } from '@/lib/admins'

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
    await deactivateAdmin(userId, ctx.user.id)
    return success({ deactivated: true })
  } catch (err) {
    return errorFromException(err)
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const ctx = await requireAdminSubRole('SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { userId } = await params

  try {
    await reactivateAdmin(userId, ctx.user.id)
    return success({ reactivated: true })
  } catch (err) {
    return errorFromException(err)
  }
}
