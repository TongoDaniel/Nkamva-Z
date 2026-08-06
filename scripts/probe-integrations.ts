/**
 * Sonde de santé par fournisseur — « set » ne veut pas dire « valide ».
 *
 *   bun scripts/probe-integrations.ts
 *
 * Chaque sonde fait l'appel le moins coûteux qui prouve que les identifiants,
 * l'endpoint et les droits sont bons. Aucune ne crée de ressource facturable.
 */
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3'
import { RoomServiceClient } from 'livekit-server-sdk'
import { activeConfiguration, isPawaPayConfigured } from '../src/lib/pawapay'

type Probe = { name: string; ok: boolean; detail: string }
const results: Probe[] = []

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(34)} ${detail}`)
}

// --- R2 -------------------------------------------------------------------

async function probeR2() {
  const { AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_BUCKET_NAME } = process.env
  if (!AWS_ENDPOINT_URL || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    return record('R2 — identifiants', false, 'non configuré')
  }
  const client = new S3Client({
    region: AWS_REGION || 'auto',
    endpoint: AWS_ENDPOINT_URL,
    credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
  })
  try {
    await client.send(new HeadBucketCommand({ Bucket: AWS_BUCKET_NAME || 'nkamva-dev' }))
    record('R2 — HeadBucket', true, `seau « ${AWS_BUCKET_NAME} » joignable`)
  } catch (error) {
    record('R2 — HeadBucket', false, String(error).slice(0, 120))
  }
}

// --- LiveKit --------------------------------------------------------------
//
// Les clients serveur du SDK parlent Twirp sur HTTP. On sonde les deux schémas
// pour savoir lequel `LIVEKIT_URL` doit porter côté serveur.

async function probeLiveKit() {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return record('LiveKit — identifiants', false, 'non configuré')
  }

  for (const [label, url] of [
    ['LiveKit — listRooms (wss://)', LIVEKIT_URL],
    ['LiveKit — listRooms (https://)', LIVEKIT_URL.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:')],
  ] as const) {
    try {
      const rooms = await new RoomServiceClient(url, LIVEKIT_API_KEY, LIVEKIT_API_SECRET).listRooms()
      record(label, true, `${rooms.length} salle(s) ouverte(s)`)
    } catch (error) {
      record(label, false, String(error).slice(0, 120))
    }
  }
}

// --- Mux ------------------------------------------------------------------

async function probeMux() {
  const { MUX_TOKEN_ID, MUX_TOKEN_SECRET } = process.env
  if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) return record('Mux — identifiants', false, 'non configuré')

  const auth = `Basic ${Buffer.from(`${MUX_TOKEN_ID}:${MUX_TOKEN_SECRET}`).toString('base64')}`

  try {
    const res = await fetch('https://api.mux.com/video/v1/assets?limit=1', { headers: { Authorization: auth } })
    record('Mux — API vidéo', res.ok, res.ok ? 'jeton accepté' : `HTTP ${res.status}`)
  } catch (error) {
    record('Mux — API vidéo', false, String(error).slice(0, 120))
  }

  // Le direct et le VOD ne relèvent pas du même droit : le plan gratuit laisse
  // **lire** la collection des flux mais refuse d'en **créer** un. Sonder la
  // lecture ne prouverait donc rien — c'est la création qui décide si les
  // replays passent par Mux ou par l'egress fichier. On la tente, et on
  // supprime immédiatement ce qu'on vient d'ouvrir : un flux laissé en place
  // est facturable.
  try {
    const res = await fetch('https://api.mux.com/video/v1/live-streams', {
      method: 'POST',
      headers: { Authorization: auth, 'content-type': 'application/json' },
      body: JSON.stringify({ playback_policy: ['public'], reconnect_window: 60 }),
    })
    if (res.ok) {
      const { data } = (await res.json()) as { data: { id: string } }
      await fetch(`https://api.mux.com/video/v1/live-streams/${data.id}`, {
        method: 'DELETE',
        headers: { Authorization: auth },
      })
      record('Mux — créer un flux direct', true, 'autorisé (flux de test supprimé)')
    } else {
      record('Mux — créer un flux direct', false, `HTTP ${res.status} ${(await res.text()).slice(0, 80)}`)
    }
  } catch (error) {
    record('Mux — créer un flux direct', false, String(error).slice(0, 120))
  }

  const signing = Boolean(process.env.MUX_SIGNING_KEY_ID && process.env.MUX_SIGNING_PRIVATE_KEY)
  record('Mux — clés de signature', signing, signing ? 'présentes' : 'absentes : lecture non signée')
}

// --- Stripe ---------------------------------------------------------------

async function probeStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return record('Stripe — identifiants', false, 'non configuré')
  try {
    const res = await fetch('https://api.stripe.com/v1/balance', { headers: { Authorization: `Bearer ${key}` } })
    const mode = key.startsWith('sk_live') ? 'LIVE' : 'test'
    record('Stripe — balance', res.ok, res.ok ? `jeton accepté (mode ${mode})` : `HTTP ${res.status}`)
  } catch (error) {
    record('Stripe — balance', false, String(error).slice(0, 120))
  }
}

// --- PawaPay --------------------------------------------------------------

async function probePawaPay() {
  if (!isPawaPayConfigured()) {
    // Ce n'est plus « paiements simulés » : sans jeton, on n'encaisse pas.
    record('PawaPay — jeton', false, 'absent : aucun encaissement possible')
    return
  }
  try {
    // `/v2/active-conf` authentifie ET dit ce que le compte peut réellement
    // faire : une sonde qui se contenterait de constater la présence du jeton
    // ne prouverait rien.
    const conf = await activeConfiguration(true)
    const countries = (conf.countries ?? []).map((c) => c.country).join(', ') || 'aucun'
    record('PawaPay — configuration active', true, `pays : ${countries}`)
    record(
      'PawaPay — callbacks signés',
      Boolean(conf.signatureConfiguration?.signedCallbacks),
      conf.signatureConfiguration?.signedCallbacks
        ? 'activés'
        : "DÉSACTIVÉS : les callbacks seront tous refusés, activez la signature côté PawaPay",
    )
  } catch (error) {
    record('PawaPay — configuration active', false, String(error).slice(0, 120))
  }
}

await probeR2()
await probeLiveKit()
await probeMux()
await probeStripe()
await probePawaPay()

const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} sondes au vert.`)
