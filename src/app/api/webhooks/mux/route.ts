// Webhook Mux — l'enregistrement d'une séance est prêt (arbitrage 38).
//
// C'est ce webhook qui referme la boucle : LiveKit a poussé le direct vers
// l'ingestion RTMP, Mux a encodé, et il nous rend ici l'identifiant de lecture.
// Sans lui, le replay resterait indéfiniment en `PROCESSING`.
import { db } from '@/lib/db'
import { auditStandalone } from '@/lib/audit'
import { verifyWebhookSignature } from '@/lib/mux'
import { markReplayReady, markReplayFailed } from '@/lib/lives'

interface MuxEvent {
  type: string
  data?: {
    id?: string
    live_stream_id?: string
    duration?: number
    playback_ids?: Array<{ id: string; policy?: string }>
    errors?: unknown
  }
}

export async function POST(request: Request) {
  const raw = await request.text()

  // La signature n'est pas optionnelle : un webhook non authentifié pourrait
  // marquer n'importe quel replay comme prêt, avec n'importe quelle vidéo.
  if (!verifyWebhookSignature(raw, request.headers.get('mux-signature'))) {
    await auditStandalone({ action: 'MUX_WEBHOOK_REJECTED', meta: { reason: 'signature' } })
    return new Response('Invalid signature', { status: 400 })
  }

  let event: MuxEvent
  try {
    event = JSON.parse(raw)
  } catch {
    return new Response('Invalid payload', { status: 400 })
  }

  const liveStreamId = event.data?.live_stream_id
  if (!liveStreamId) {
    await auditStandalone({ action: 'MUX_WEBHOOK_IGNORED', meta: { type: event.type } })
    return new Response(null, { status: 200 })
  }

  const session = await db.liveSession.findFirst({
    where: { muxStreamId: liveStreamId },
    select: { id: true },
  })
  // Un flux qui ne correspond à aucune séance n'est pas une erreur de notre
  // côté : on l'acquitte pour que Mux cesse de le rejouer.
  if (!session) {
    await auditStandalone({
      action: 'MUX_WEBHOOK_UNKNOWN_STREAM', meta: { liveStreamId, type: event.type },
    })
    return new Response(null, { status: 200 })
  }

  switch (event.type) {
    case 'video.asset.ready': {
      const playbackId = event.data?.playback_ids?.[0]?.id
      if (!playbackId) {
        await markReplayFailed(session.id, 'asset sans identifiant de lecture')
        break
      }
      await markReplayReady(session.id, {
        muxAssetId: event.data?.id,
        muxPlaybackId: playbackId,
        durationSeconds: event.data?.duration,
        // Pas de `sizeBytes` : l'octet est chez Mux, il ne pèse pas sur le
        // quota du formateur (arbitrage 54).
      })
      break
    }

    case 'video.asset.errored':
      await markReplayFailed(session.id, 'encodage en échec chez le fournisseur')
      break

    default:
      await auditStandalone({ action: 'MUX_WEBHOOK_EVENT_IGNORED', meta: { type: event.type } })
  }

  return new Response(null, { status: 200 })
}
