// Applique ou lève une sanction de compte — décision 67, deux niveaux.
//
// **La Modération met en lecture seule, le Super-admin seul coupe la
// connexion.** C'est exactement ce que `applySanction` refuse déjà : tout ce qui
// touche à `BANNED`, pose comme levée, exige `SUPER_ADMIN`. Cette route
// exigeait pourtant `SUPER_ADMIN` pour *tout*, ce qui rendait la moitié de la
// décision 67 inatteignable — la Modération instruit les signalements visant un
// compte (décision 63) sans pouvoir en tirer la seule conséquence qui lui
// revienne.
//
// Décision 7 reste entière : la Modération n'a pas l'annuaire des utilisateurs.
// Elle sanctionne depuis le dossier qu'elle instruit, pas en parcourant les
// comptes.
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { applySanction } from '@/lib/user-sanctions'

const SanctionSchema = z.object({
  level: z.enum(['NONE', 'RESTRICTED', 'BANNED']),
  reason: z.string().trim().min(10, 'Motif trop court').max(2000),
})

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
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
        // Le rôle réel, jamais une constante : c'est lui qui décide si
        // l'exclusion est permise, et le figer à 'SUPER_ADMIN' donnerait à la
        // Modération un pouvoir que la décision 67 lui refuse.
        actorAdminRole: ctx.user.adminRole as 'SUPER_ADMIN' | 'MODERATION',
      }),
    )
  } catch (err) {
    return errorFromException(err)
  }
}
