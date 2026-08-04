// Super-admin : applique ou lève une sanction de compte.
//
// Décision 7 — la Modération n'a pas accès à l'annuaire des utilisateurs, et
// Finances y a une lecture seule. Sanctionner depuis un signalement, côté
// Modération, reste à câbler séparément.
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { applySanction } from '@/lib/user-sanctions'

const SanctionSchema = z.object({
  level: z.enum(['NONE', 'RESTRICTED', 'BANNED']),
  reason: z.string().trim().min(10, 'Motif trop court').max(2000),
})

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const ctx = await requireAdminSubRole('SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { userId } = await params

  const parsed = await parseBody(request, SanctionSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(
      await applySanction(userId, {
        level: parsed.data.level,
        reason: parsed.data.reason,
        actorId: ctx.user.id,
        actorAdminRole: 'SUPER_ADMIN',
      }),
    )
  } catch (err) {
    return errorFromException(err)
  }
}
