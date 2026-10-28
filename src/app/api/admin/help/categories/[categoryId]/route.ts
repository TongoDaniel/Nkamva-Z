// Aide & FAQ — modifier ou supprimer une rubrique (Super-admin, Modération)
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { deleteHelpCategory, updateHelpCategory, type HelpEditorRole } from '@/lib/help-content'
import { CategorySchema } from '../../schemas'

type Params = { params: Promise<{ categoryId: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const ctx = await requireAdminSubRole('SUPER_ADMIN', 'MODERATION')
  if (ctx instanceof Response) return ctx
  const { categoryId } = await params

  const parsed = await parseBody(request, CategorySchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await updateHelpCategory(categoryId, parsed.data, { id: ctx.user.id, role: ctx.user.adminRole as HelpEditorRole }))
  } catch (err) {
    return errorFromException(err)
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await requireAdminSubRole('SUPER_ADMIN', 'MODERATION')
  if (ctx instanceof Response) return ctx
  const { categoryId } = await params

  try {
    await deleteHelpCategory(categoryId, { id: ctx.user.id, role: ctx.user.adminRole as HelpEditorRole })
    return success({ deleted: true })
  } catch (err) {
    return errorFromException(err)
  }
}
