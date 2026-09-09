// Confirme le dépôt de ma photo et enregistre la clé.
//
// C'est ici, et seulement ici, que `avatarS3Key` entre en base : sans cette
// étape l'objet vivrait sur R2 sans que rien ne le référence.
import { z } from 'zod'
import { success, requireAuth, parseBody, errorFromException } from '@/lib/api'
import { confirmUserAvatar } from '@/lib/avatars'

const ConfirmSchema = z.object({
  s3Key: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(120),
})

export async function POST(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const parsed = await parseBody(request, ConfirmSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(await confirmUserAvatar(ctx.user.id, parsed.data))
  } catch (err) {
    return errorFromException(err)
  }
}
