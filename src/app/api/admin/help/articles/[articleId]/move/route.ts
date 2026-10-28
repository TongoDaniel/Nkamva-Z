// Aide & FAQ — monter ou descendre une question dans sa rubrique (Super-admin, Modération)
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { moveHelpItem, type HelpEditorRole } from '@/lib/help-content'
import { MoveSchema } from '../../../schemas'

export async function POST(request: Request, { params }: { params: Promise<{ articleId: string }> }) {
  const ctx = await requireAdminSubRole('SUPER_ADMIN', 'MODERATION')
  if (ctx instanceof Response) return ctx
  const { articleId } = await params

  const parsed = await parseBody(request, MoveSchema)
  if (parsed instanceof Response) return parsed

  try {
    const moved = await moveHelpItem('article', articleId, parsed.data.direction, { id: ctx.user.id, role: ctx.user.adminRole as HelpEditorRole })
    return success({ moved })
  } catch (err) {
    return errorFromException(err)
  }
}
