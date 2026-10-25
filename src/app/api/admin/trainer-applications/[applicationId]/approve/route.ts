// Lot 1 — Modération : approuver une candidature (T3)
// Crée TrainerProfile + Wallet et bascule le rôle en TRAINER, dans une seule
// transaction.
import { z } from 'zod'
import { success, requireAdminSubRole, parseBody, errorFromException } from '@/lib/api'
import { approveApplication } from '@/lib/trainer-applications'
import { wordsField } from '@/lib/text-input'

const ApproveSchema = z.object({
  // Nom légal relevé sur la pièce d'identité : il devient la référence pour la
  // vérification du RIB au Lot 3.
  // Nettoyé avant d'être mesuré : deux espaces passaient `min(2)`, et ce vide
  // était recopié sur le moyen de paiement (m1).
  verifiedLegalName: wordsField(2, 200),
  expectedUpdatedAt: z.string(),
})

export async function POST(request: Request, { params }: { params: Promise<{ applicationId: string }> }) {
  const ctx = await requireAdminSubRole('MODERATION', 'SUPER_ADMIN')
  if (ctx instanceof Response) return ctx
  const { applicationId } = await params

  const parsed = await parseBody(request, ApproveSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await approveApplication(applicationId, { ...parsed.data, actorId: ctx.user.id }))
  } catch (err) {
    return errorFromException(err)
  }
}
