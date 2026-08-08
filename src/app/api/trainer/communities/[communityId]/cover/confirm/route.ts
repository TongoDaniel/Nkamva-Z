// Formateur — confirme le dépôt d'une bannière et enregistre la clé.
//
// C'est ici, et seulement ici, que `coverS3Key` entre en base : sans cette
// étape l'objet vivrait sur R2 sans que rien ne le référence, et le quota de
// stockage ignorerait sa taille.
import { z } from 'zod'
import { success, requireTrainer, parseBody, errorFromException } from '@/lib/api'
import { confirmCommunityCover } from '@/lib/communities'

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
      await confirmCommunityCover(communityId, ctx.user.trainerId!, ctx.user.id, parsed.data),
    )
  } catch (err) {
    return errorFromException(err)
  }
}
