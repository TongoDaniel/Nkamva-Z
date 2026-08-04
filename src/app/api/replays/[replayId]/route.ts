// Un replay — sa fiche, et l'URL signée de lecture ou de téléchargement.
//
// Arbitrage 55 : les deux cadences ayant des droits identiques, le
// téléchargement est un **droit uniforme** de tout membre. Il n'y a pas de case
// « téléchargeable » par séance, et il ne faut pas en ajouter.
import { success, requireAuth, errorFromException } from '@/lib/api'
import { getReplay, getReplayUrl } from '@/lib/lives'

type Params = { params: Promise<{ replayId: string }> }

export async function GET(request: Request, { params }: Params) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const { replayId } = await params
  const wantsUrl = new URL(request.url).searchParams.get('lecture') === '1'

  try {
    if (wantsUrl) return success({ url: await getReplayUrl(replayId, ctx.user.id) })
    return success(await getReplay(replayId, ctx.user.id))
  } catch (err) {
    return errorFromException(err)
  }
}
