// Agenda des séances — celui de l'apprenant, ou celui du formateur qui anime.
import { z } from 'zod'
import { success, requireAuth, requireTrainer, parseBody, errorFromException } from '@/lib/api'
import { listMyAgenda, listTrainerSessions, scheduleLiveSession } from '@/lib/lives'

const ScheduleSchema = z
  .object({
    communityId: z.string().uuid(),
    title: z.string().min(1).max(160),
    description: z.string().max(2000).optional(),
    scheduledStartAt: z.string().datetime(),
    durationMinutes: z.number().int().min(5).max(480).optional(),
    // Arbitrage 107 — le fuseau dans lequel l'animateur a saisi l'heure. Le
    // navigateur l'envoie ; le service ignore ce qu'il ne reconnaît pas.
    timeZone: z.string().max(64).optional(),
  })
  .strict()

export async function GET(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  // `?role=trainer` bascule sur la console : un formateur reste un apprenant,
  // et ses deux agendas n'ont pas le même contenu — le sien montre aussi le
  // passé, qu'il anime.
  const url = new URL(request.url)
  const asTrainer = url.searchParams.get('role') === 'trainer'

  try {
    if (asTrainer && ctx.user.trainerId) {
      return success(await listTrainerSessions(ctx.user.trainerId))
    }
    return success(await listMyAgenda(ctx.user.id))
  } catch (err) {
    return errorFromException(err)
  }
}

export async function POST(request: Request) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx

  const parsed = await parseBody(request, ScheduleSchema)
  if (parsed instanceof Response) return parsed

  try {
    return success(
      await scheduleLiveSession(parsed.data.communityId, ctx.user.trainerId!, ctx.user.id, {
        title: parsed.data.title,
        description: parsed.data.description,
        scheduledStartAt: new Date(parsed.data.scheduledStartAt),
        durationMinutes: parsed.data.durationMinutes,
        timeZone: parsed.data.timeZone,
      }),
      undefined,
      201,
    )
  } catch (err) {
    return errorFromException(err)
  }
}
