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
  const query = new URL(request.url).searchParams
  const wantsUrl = query.get('lecture') === '1'
  // Arbitrage 94 — la variante audio seule, pour les connexions faibles. Un
  // paramètre plutôt qu'une route : c'est le même droit d'accès, la même
  // vérification, et un seul endroit où elle se fait.
  const variant = query.get('variante') === 'audio' ? 'audio' : 'video'

  try {
    if (wantsUrl) {
      return success({ url: await getReplayUrl(replayId, ctx.user.id, false, variant) })
    }
    return success(await getReplay(replayId, ctx.user.id))
  } catch (err) {
    return errorFromException(err)
  }
}
