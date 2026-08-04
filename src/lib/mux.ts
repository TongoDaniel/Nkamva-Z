// ==========================================================================
// Enregistrement et diffusion des replays — adaptateur Mux
// ==========================================================================
// Répartition des rôles entre les deux fournisseurs, et elle n'est pas
// arbitraire : **LiveKit transporte le direct, Mux enregistre et rediffuse.**
// C'est ce que chacun sait faire le mieux, et c'est ce que la présence des deux
// jeux de clés dans l'environnement laissait entendre depuis le début.
//
// Le chemin est le suivant :
//
//   1. À l'ouverture d'une séance, on crée un *live stream* Mux et on récupère
//      sa clé d'ingestion RTMP.
//   2. L'egress LiveKit pousse la composition de la salle vers cette URL RTMP.
//   3. Mux enregistre, encode, et produit un *asset* avec un identifiant de
//      lecture. Il prévient par webhook — c'est `MUX_WEBHOOK_SECRET`.
//   4. Le replay se lit en HLS adaptatif, sans URL signée à renouveler ni
//      fichier à stocker chez nous.
//
// Conséquence agréable sur le quota du formateur (arbitrage 54) : un replay
// hébergé par Mux ne consomme pas son espace. `Replay.sizeBytes` reste nul, et
// `trainerStorageUsedBytes` n'en tient pas compte — ce qui est juste, puisque
// l'octet n'est pas chez nous.
//
// **Sans clés Mux, rien ne casse** : `startRecording` retombe sur l'egress
// fichier vers le stockage objet. Même patron que partout ailleurs ici.
// ==========================================================================

import { createHmac, timingSafeEqual } from 'node:crypto'

const API = 'https://api.mux.com'

export function isMuxConfigured(): boolean {
  return Boolean(process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET)
}

function authHeader(): string {
  const raw = `${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`
  return `Basic ${Buffer.from(raw).toString('base64')}`
}

export interface MuxLiveStream {
  streamId: string
  streamKey: string
  /** URL RTMP complète, prête pour l'egress LiveKit. */
  rtmpUrl: string
}

/**
 * Ouvre un flux d'ingestion. Rend `null` si Mux n'est pas configuré ou si
 * l'appel échoue : une séance doit pouvoir avoir lieu même sans enregistrement
 * (arbitrage 38 promet un replay, pas un live conditionné à son enregistrement).
 */
export async function createLiveStream(): Promise<MuxLiveStream | null> {
  if (!isMuxConfigured()) return null

  try {
    const res = await fetch(`${API}/video/v1/live-streams`, {
      method: 'POST',
      headers: { authorization: authHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({
        playback_policy: ['public'],
        // L'asset produit hérite de sa propre politique : c'est lui qui portera
        // le replay, longtemps après la fin du flux.
        new_asset_settings: { playback_policy: ['public'] },
        // Une coupure réseau de l'animateur ne doit pas clore l'enregistrement.
        reconnect_window: 60,
        latency_mode: 'low',
      }),
    })
    if (!res.ok) {
      console.error('[MUX:CREATE_STREAM]', { status: res.status, body: await res.text() })
      return null
    }

    const { data } = (await res.json()) as {
      data: { id: string; stream_key: string }
    }
    return {
      streamId: data.id,
      streamKey: data.stream_key,
      rtmpUrl: `rtmps://global-live.mux.com:443/app/${data.stream_key}`,
    }
  } catch (err) {
    console.error('[MUX:CREATE_STREAM_FAILED]', String(err))
    return null
  }
}

/** Ferme le flux d'ingestion. L'asset déjà produit, lui, survit. */
export async function disableLiveStream(streamId: string): Promise<void> {
  if (!isMuxConfigured()) return
  try {
    await fetch(`${API}/video/v1/live-streams/${streamId}/disable`, {
      method: 'PUT',
      headers: { authorization: authHeader() },
    })
  } catch (err) {
    console.warn('[MUX:DISABLE_STREAM]', { streamId, error: String(err) })
  }
}

/** URL de lecture HLS. Aucune signature à renouveler : la politique est publique. */
export function playbackUrl(playbackId: string): string {
  return `https://stream.mux.com/${playbackId}.m3u8`
}

/** URL de téléchargement du fichier maître (arbitrage 55 — droit uniforme). */
export function downloadUrl(playbackId: string): string {
  return `https://stream.mux.com/${playbackId}/high.mp4`
}

/**
 * Vérifie la signature d'un webhook Mux.
 *
 * En-tête `Mux-Signature: t=<horodatage>,v1=<hmac>`, le HMAC portant sur
 * `<horodatage>.<corps brut>`. La comparaison passe par `timingSafeEqual` :
 * une comparaison de chaînes ordinaire fuit la signature attendue, un octet à
 * la fois. Même précaution que le webhook CinetPay.
 */
export function verifyWebhookSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.MUX_WEBHOOK_SECRET
  // Sans secret configuré, on refuse plutôt que d'accepter : un webhook non
  // authentifié peut marquer n'importe quel replay comme prêt.
  if (!secret || !header) return false

  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const [k, v] = p.split('=')
      return [k?.trim(), v?.trim()]
    }),
  )
  const timestamp = parts.t
  const signature = parts.v1
  if (!timestamp || !signature) return false

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
