// Formateur — confirme le dépôt de la photo du groupe et enregistre la clé.
//
// C'est ici que la taille réelle est relue : c'est elle qui pèse dans le quota
// de stockage (arbitrage 54), jamais celle annoncée par le navigateur.
import { z } from 'zod'
import { success, requireTrainer, parseBody, errorFromException } from '@/lib/api'
import { confirmCommunityAvatar } from '@/lib/avatars'

const ConfirmSchema = z.object({
  s3Key: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(120),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ communityId: string }> },
) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const { communityId } = await params

  const parsed = await parseBody(request, ConfirmSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(
      await confirmCommunityAvatar(communityId, ctx.user.trainerId!, ctx.user.id, parsed.data),
    )
  } catch (err) {
    return errorFromException(err)
  }
}
