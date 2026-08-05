// Super-admin — changer la valeur d'un réglage existant
//
// N'accepte que la clé déjà posée en base : cette route ne crée jamais de
// nouvelle clé, pour ne pas transformer `Setting` en fourre-tout non
// documenté. Voir `src/lib/settings.ts`.
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { updateSetting } from '@/lib/settings'

const UpdateSchema = z.object({ value: z.string().trim().min(1).max(500) })

export async function PATCH(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const ctx = await requireAdminSubRole('SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { key } = await params

  const parsed = await parseBody(request, UpdateSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await updateSetting(key, parsed.data.value, ctx.user.id))
  } catch (err) {
    return errorFromException(err)
  }
}
