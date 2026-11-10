// Plan d'action 1.4 et 1.7 : le service client note le contact d'un formateur
// resté sans vente ; le commercial note son suivi. Chacun n'écrit que sa sorte
// de note.
import { z } from 'zod'
import { success, error, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { hasAdminRole } from '@/lib/admin-roles'
import { addTrainerNote } from '@/lib/trainer-follow-up'

const Schema = z.object({
  kind: z.enum(['SUPPORT_CONTACT', 'SALES_NOTE']),
  body: z.string().trim().min(2).max(2000),
})

export async function POST(request: Request, { params }: { params: Promise<{ trainerId: string }> }) {
  const ctx = await requireAdminSubRole('SUPPORT', 'SALES')
  if (ctx instanceof Response) return ctx
  const { trainerId } = await params
  const parsed = await parseBody(request, Schema)
  if (parsed instanceof Response) return parsed

  const needed = parsed.data.kind === 'SUPPORT_CONTACT' ? 'SUPPORT' : 'SALES'
  if (!hasAdminRole(ctx.user, needed)) {
    return error('FORBIDDEN_SUBROLE', 'Cette note appartient à un autre rôle.', 403)
  }
  try {
    return success(await addTrainerNote({ trainerId, authorId: ctx.user.id, authorRole: needed, ...parsed.data }))
  } catch (err) {
    if (err instanceof Error && err.message === 'TRAINER_NOT_FOUND') return error('TRAINER_NOT_FOUND', 'Formateur introuvable.', 404)
    return errorFromException(err)
  }
}
