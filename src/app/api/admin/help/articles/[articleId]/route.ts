// Aide & FAQ — modifier ou supprimer une question (Super-admin, Modération)
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { deleteHelpArticle, updateHelpArticle, type HelpEditorRole } from '@/lib/help-content'
import { ArticleSchema } from '../../schemas'

type Params = { params: Promise<{ articleId: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const ctx = await requireAdminSubRole('SUPER_ADMIN', 'MODERATION')
  if (ctx instanceof Response) return ctx
  const { articleId } = await params

  const parsed = await parseBody(request, ArticleSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await updateHelpArticle(articleId, parsed.data, { id: ctx.user.id, role: ctx.user.adminRole as HelpEditorRole }))
  } catch (err) {
    return errorFromException(err)
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await requireAdminSubRole('SUPER_ADMIN', 'MODERATION')
  if (ctx instanceof Response) return ctx
  const { articleId } = await params

  try {
    await deleteHelpArticle(articleId, { id: ctx.user.id, role: ctx.user.adminRole as HelpEditorRole })
    return success({ deleted: true })
  } catch (err) {
    return errorFromException(err)
  }
}
