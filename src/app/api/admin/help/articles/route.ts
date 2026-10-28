// Aide & FAQ — créer une question (Super-admin, Modération)
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { createHelpArticle, type HelpEditorRole } from '@/lib/help-content'
import { ArticleSchema } from '../schemas'

export async function POST(request: Request) {
  const ctx = await requireAdminSubRole('SUPER_ADMIN', 'MODERATION')
  if (ctx instanceof Response) return ctx

  const parsed = await parseBody(request, ArticleSchema)
  if (parsed instanceof Response) return parsed

  try {
    const created = await createHelpArticle(parsed.data, { id: ctx.user.id, role: ctx.user.adminRole as HelpEditorRole })
    return success(created, undefined, 201)
  } catch (err) {
    return errorFromException(err)
  }
}
