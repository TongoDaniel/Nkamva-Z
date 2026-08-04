// Formateur : inclure ou retirer une ressource de sa communauté.
//
// Arbitrage 47 — inclure bascule le circuit de la ressource : elle n'est plus
// vendue à l'unité. Arbitrage 48 — retirer borne la liaison sans la supprimer,
// tout membre qui y avait accès le conserve.
import { z } from 'zod'
import { success, requireTrainer, parseBody, errorFromException } from '@/lib/api'
import { linkCourseToCommunity, unlinkCourseFromCommunity } from '@/lib/communities'

const BodySchema = z.object({ courseId: z.string().uuid() })

export async function POST(request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const { communityId } = await params

  const parsed = await parseBody(request, BodySchema)
  if (parsed instanceof Response) return parsed

  try {
    const link = await linkCourseToCommunity(
      communityId, parsed.data.courseId, ctx.user.trainerId!, ctx.user.id,
    )
    return success({ id: link.id, linkedAt: link.linkedAt }, undefined, 201)
  } catch (err) {
    return errorFromException(err)
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const { communityId } = await params

  const parsed = await parseBody(request, BodySchema)
  if (parsed instanceof Response) return parsed

  try {
    await unlinkCourseFromCommunity(
      communityId, parsed.data.courseId, ctx.user.trainerId!, ctx.user.id,
    )
    return success({ unlinked: true })
  } catch (err) {
    return errorFromException(err)
  }
}
