// Modèle v1.1 : la liste des formateurs fondateurs est fixée par Jaurès : ils
// accèdent au plan Pro dès le lancement. Propriétaire seulement : c'est une
// décision de prix.
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'

const FounderSchema = z.object({ founder: z.boolean() })

export async function POST(request: Request, { params }: { params: Promise<{ trainerId: string }> }) {
  const ctx = await requireAdminSubRole('SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { trainerId } = await params
  const parsed = await parseBody(request, FounderSchema)
  if (parsed instanceof Response) return parsed

  try {
    const updated = await db.$transaction(async (tx) => {
      const profile = await tx.trainerProfile.update({
        where: { id: trainerId },
        data: { founder: parsed.data.founder },
        select: { id: true, founder: true },
      })
      await audit(tx, {
        actorId: ctx.user.id, actorRole: 'SUPER_ADMIN',
        action: parsed.data.founder ? 'TRAINER_FOUNDER_GRANTED' : 'TRAINER_FOUNDER_REVOKED',
        targetType: 'TrainerProfile', targetId: trainerId,
      })
      return profile
    })
    return success(updated)
  } catch (err) {
    return errorFromException(err)
  }
}
