// ==========================================================================
// État des intégrations — ce que la plateforme sait faire à l'instant
// ==========================================================================
// « La variable est posée » ne veut pas dire « ça marche ». Ce module fait, par
// fournisseur, l'appel le moins coûteux qui prouve que l'identifiant, l'endpoint
// et les droits sont bons, puis rend un état lisible par un écran.
//
// C'est le pendant en ligne de `scripts/probe-integrations.ts`, et il tient
// quatre règles que le script n'avait pas à tenir :
//
//   1. **Aucune sonde n'écrit ni ne facture.** Le script ouvre un flux Mux puis
//      le supprime : acceptable pour une commande lancée à la main, inacceptable
//      ici, où chaque affichage de l'écran rejouerait la création. La sonde
//      d'écriture reste au script ; cet écran ne lit que. Conséquence à assumer :
//      il ne peut pas dire si le plan Mux autorise le direct, seulement si le
//      jeton est accepté.
//   2. **Aucune valeur de secret ne sort d'ici.** On rend la présence, jamais le
//      contenu, et les messages d'erreur du fournisseur sont expurgés avant
//      d'être rendus — un SDK qui recopie la clé dans son message la publierait
//      sinon sur un écran d'administration. Seule exception : `sk_live` / `sk_test`,
//      qui ne dit pas la clé mais le mode.
//   3. **Chaque sonde a un délai maximum.** Un fournisseur qui pend ne doit pas
//      faire pendre l'écran qui vient constater qu'il pend.
//   4. **Ce que l'absence provoque est écrit noir sur blanc.** C'est la raison
//      d'être de l'écran : plusieurs adaptateurs se dégradent en silence, et
//      c'est précisément ce silence qui a laissé croire pendant des semaines que
//      le stockage objet fonctionnait.
//
// La configuration est toujours relue via l'adaptateur du fournisseur
// (`storageConfig()`, `pawapayConfig()`, `isMuxConfigured()`…) et jamais
// redevinée depuis `process.env` : deux lectures divergentes de la même
// configuration, c'est exactement le défaut que `s3.ts` a mis des semaines à
// avouer.
// ==========================================================================

import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3'
import { RoomServiceClient } from 'livekit-server-sdk'
import { storageConfig } from './s3'
import { isMuxConfigured } from './mux'
import { isStripeConfigured } from './stripe'
import { activeConfiguration, isPawaPayConfigured, pawapayConfig } from './pawapay'

/** Au-delà, la sonde est déclarée sans réponse. L'écran doit rester ouvrable. */
export const PROBE_TIMEOUT_MS = 8_000

/**
 * · `ok`     — vérifié par un appel réel, pas par la présence d'une variable.
 * · `warn`   — ça marche, mais une capacité manque ou un réglage surprendra.
 * · `absent` — non configuré. Panne de configuration, pas d'incident.
 * · `down`   — configuré et pourtant en échec : identifiants refusés, endpoint
 *              injoignable, ou droit manquant. C'est le seul cas qui appelle
 *              quelqu'un du fournisseur.
 */
export type IntegrationState = 'ok' | 'warn' | 'absent' | 'down'

/** Un `absent` reste moins grave qu'un `down` : personne n'a rien cassé. */
const SEVERITY: Record<IntegrationState, number> = { ok: 0, warn: 1, absent: 2, down: 3 }

export interface IntegrationCheck {
  label: string
  state: IntegrationState
  /** Ce que la sonde a constaté. Une phrase, sans secret. */
  detail: string
}

export type EnvRequirement = 'required' | 'production' | 'optional'

export interface EnvVarStatus {
  name: string
  present: boolean
  requirement: EnvRequirement
  /** À quoi elle sert, quand ce n'est pas déductible du nom. */
  note?: string
}

export interface Integration {
  key: 'stripe' | 'resend' | 'pawapay' | 'storage' | 'mux' | 'livekit'
  name: string
  /** Ce que le fournisseur porte dans la plateforme. */
  purpose: string
  /** Ce qui se passe réellement sans lui — le comportement du code, pas la théorie. */
  whenAbsent: string
  env: EnvVarStatus[]
  checks: IntegrationCheck[]
  /** Le pire des `checks`. */
  state: IntegrationState
  /** Durée de la sonde. Un fournisseur lent se voit avant de devenir un incident. */
  elapsedMs: number
}

export interface IntegrationsReport {
  probedAt: Date
  integrations: Integration[]
  /**
   * Le raccourci de développement des paiements. Il n'appartient à aucun
   * fournisseur et pourtant il décide si un achat encaisse ou fait semblant :
   * l'écran d'état des intégrations est le seul endroit où sa présence se voit.
   */
  paymentSimulation: { active: boolean; declared: boolean; detail: string }
}

// --- Outils ---------------------------------------------------------------

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

/**
 * `''` et la chaîne `"undefined"` comptent pour absentes. La seconde n'est pas
 * une coquetterie : un test qui restaure `process.env.X = undefined` écrit
 * littéralement `"undefined"`, une valeur *truthy* qui ferait passer une clé
 * inexistante pour posée.
 */
function present(name: string): boolean {
  const value = process.env[name]
  return Boolean(value) && value !== 'undefined'
}

/**
 * Efface des messages fournisseur toute valeur de secret connue. Un SDK qui
 * recopie l'identifiant dans son message d'erreur le publierait sinon sur
 * l'écran — et l'écran est justement celui qu'on ouvre quand ça va mal, donc
 * celui qu'on partage en capture.
 */
const SECRET_ENV = [
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'PAWAPAY_API_TOKEN',
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY',
  'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET',
  'MUX_TOKEN_ID', 'MUX_TOKEN_SECRET', 'MUX_WEBHOOK_SECRET',
  'NEXTAUTH_SECRET',
]

function scrub(text: string): string {
  let out = text
  for (const name of SECRET_ENV) {
    const value = process.env[name]
    // En dessous de huit caractères, on effacerait des fragments de phrase.
    if (value && value !== 'undefined' && value.length >= 8) out = out.split(value).join('••••')
  }
  return out
}

/** Message d'erreur d'une sonde : une ligne, expurgée, bornée. */
function detailFrom(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return scrub(raw).replace(/\s+/g, ' ').trim().slice(0, 180) || 'échec sans message'
}

class ProbeTimeout extends Error {
  constructor(ms: number) {
    super(`aucune réponse en ${Math.round(ms / 1000)} s`)
  }
}

/**
 * Borne une promesse qui n'expose pas de délai — les clients serveur LiveKit et
 * S3 n'en prennent pas en paramètre. L'appel continue en arrière-plan, on ne
 * l'attend simplement plus.
 */
async function withTimeout<T>(promise: Promise<T>, ms = PROBE_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ProbeTimeout(ms)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

interface ProbeResponse {
  ok: boolean
  status: number
  body: string
}

/**
 * `cache: 'no-store'` n'est pas décoratif : Next mémoïse `fetch` côté serveur,
 * et un état d'intégration servi depuis le cache dirait « au vert » longtemps
 * après la panne. Un écran d'état qui se souvient ne sert à rien.
 */
async function probeGet(url: string, headers: Record<string, string>): Promise<ProbeResponse> {
  const res = await fetch(url, {
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  })
  return { ok: res.ok, status: res.status, body: (await res.text()).slice(0, 400) }
}

function worstOf(checks: IntegrationCheck[]): IntegrationState {
  return checks.reduce<IntegrationState>(
    (worst, check) => (SEVERITY[check.state] > SEVERITY[worst] ? check.state : worst),
    'ok',
  )
}

/** Fabrique l'intégration en calculant son état agrégé et sa durée. */
function build(
  base: Omit<Integration, 'state' | 'elapsedMs'>,
  startedAt: number,
): Integration {
  return { ...base, state: worstOf(base.checks), elapsedMs: Math.round(performance.now() - startedAt) }
}

// --- Stripe ---------------------------------------------------------------

async function probeStripe(): Promise<Integration> {
  const startedAt = performance.now()
  const key = process.env.STRIPE_SECRET_KEY
  const checks: IntegrationCheck[] = []

  if (!isStripeConfigured() || !key) {
    checks.push({
      label: 'Clé secrète',
      state: 'absent',
      detail: 'STRIPE_SECRET_KEY absente : aucun paiement par carte ne peut s\'ouvrir.',
    })
  } else {
    // `/v1/balance` est en lecture seule et n'existe pas sans authentification :
    // il prouve la clé sans rien créer.
    try {
      const res = await probeGet('https://api.stripe.com/v1/balance', {
        authorization: `Bearer ${key}`,
      })
      checks.push({
        label: 'Solde lisible',
        state: res.ok ? 'ok' : 'down',
        detail: res.ok
          ? `Jeton accepté, compte en mode ${key.startsWith('sk_live') ? 'RÉEL (sk_live)' : 'test (sk_test)'}.`
          : `Refus HTTP ${res.status} — la clé est posée mais Stripe ne la reconnaît pas.`,
      })
    } catch (err) {
      checks.push({ label: 'Solde lisible', state: 'down', detail: detailFrom(err) })
    }

    // Le webhook Stripe échoue désormais fermé, comme Mux : sans secret, la
    // signature ne peut pas être vérifiée, et la route refuse en 400 plutôt que
    // de lire le corps. Elle se dégradait en ouvert — n'importe quel POST
    // anonyme créditait alors un portefeuille par `payment_intent.succeeded`.
    // C'était le trou le plus coûteux de cet écran ; ce n'en est plus un, mais
    // l'absence reste une impasse : plus aucun paiement ne se confirme.
    //
    // Seule exception, et elle est verrouillée deux fois : sous
    // `simulationAllowed()` (NODE_ENV hors production ET
    // ALLOW_PAYMENT_SIMULATION=1), le corps non signé est encore lu.
    const signed = present('STRIPE_WEBHOOK_SECRET')
    const simulationOpen = process.env.ALLOW_PAYMENT_SIMULATION === '1' && !isProduction()
    checks.push({
      label: 'Signature des webhooks',
      state: signed ? 'ok' : simulationOpen ? 'warn' : 'down',
      detail: signed
        ? 'Secret posé : /api/webhooks/stripe vérifie la signature et refuse tout corps non signé.'
        : simulationOpen
          ? 'STRIPE_WEBHOOK_SECRET absente : /api/webhooks/stripe n\'accepte un corps non signé que sous les deux verrous de simulation, actuellement ouverts. Aucun paiement réel ne peut être confirmé.'
          : 'STRIPE_WEBHOOK_SECRET absente : /api/webhooks/stripe refuse tout corps non signé (400, journalisé en STRIPE_WEBHOOK_REJECTED). Aucun paiement ne peut être confirmé.',
    })
  }

  return build(
    {
      key: 'stripe',
      name: 'Stripe',
      purpose: 'Encaissement par carte bancaire, et réception des contestations (chargebacks).',
      whenAbsent:
        'openProviderPayment() lève PAYMENT_PROVIDER_UNAVAILABLE : l\'achat par carte est refusé, il n\'est pas crédité gratuitement.',
      env: [
        { name: 'STRIPE_SECRET_KEY', present: present('STRIPE_SECRET_KEY'), requirement: 'required' },
        {
          name: 'STRIPE_WEBHOOK_SECRET',
          present: present('STRIPE_WEBHOOK_SECRET'),
          requirement: 'production',
          note: 'Sans elle, le webhook refuse tout callback : aucun paiement ne se confirme.',
        },
      ],
      checks,
    },
    startedAt,
  )
}

// --- Resend ---------------------------------------------------------------

interface ResendDomain {
  name?: string
  status?: string
}

async function probeResend(): Promise<Integration> {
  const startedAt = performance.now()
  const key = process.env.RESEND_API_KEY
  const checks: IntegrationCheck[] = []
  const from = process.env.EMAIL_FROM || 'NKAMVA <noreply@nkamva.com>'
  const fromDomain = from.match(/@([^\s>]+)/)?.[1]?.toLowerCase() ?? null

  if (!key || key === 'undefined') {
    checks.push({
      label: 'Clé d\'API',
      state: 'absent',
      detail: 'RESEND_API_KEY absente : sendEmail() journalise en console et rend la main sans envoyer.',
    })
  } else {
    try {
      const res = await probeGet('https://api.resend.com/domains', { authorization: `Bearer ${key}` })
      if (res.ok) {
        const parsed = JSON.parse(res.body || '{}') as { data?: ResendDomain[] }
        const domains = parsed.data ?? []
        checks.push({
          label: 'Clé d\'API',
          state: 'ok',
          detail: `Jeton accepté, ${domains.length} domaine(s) déclaré(s).`,
        })

        // Un domaine d'expédition non vérifié ne fait pas échouer l'appel : il
        // fait rejeter le message. Le comparer à `EMAIL_FROM` est la seule
        // vérification qui dise si un email partira vraiment.
        if (fromDomain) {
          const match = domains.find((d) => d.name?.toLowerCase() === fromDomain)
          checks.push({
            label: 'Domaine d\'expédition',
            state: match?.status === 'verified' ? 'ok' : 'down',
            detail: !match
              ? `EMAIL_FROM expédie depuis « ${fromDomain} », qui n'est pas déclaré chez Resend : les envois seront rejetés.`
              : match.status === 'verified'
                ? `« ${fromDomain} » vérifié.`
                : `« ${fromDomain} » déclaré mais à l'état « ${match.status} » : les envois seront rejetés jusqu'à sa vérification.`,
          })
        }
      } else if (res.status === 401 && res.body.includes('restricted_api_key')) {
        // Une clé « sending only » est parfaitement valide et refuse pourtant
        // cette lecture. La déclarer en panne serait un faux négatif.
        checks.push({
          label: 'Clé d\'API',
          state: 'warn',
          detail: 'Clé restreinte à l\'envoi : valide, mais elle ne permet pas de lister les domaines — le domaine d\'expédition n\'est donc pas vérifiable d\'ici.',
        })
      } else {
        checks.push({
          label: 'Clé d\'API',
          state: 'down',
          detail: `Refus HTTP ${res.status} — la clé est posée mais Resend ne la reconnaît pas.`,
        })
      }
    } catch (err) {
      checks.push({ label: 'Clé d\'API', state: 'down', detail: detailFrom(err) })
    }
  }

  return build(
    {
      key: 'resend',
      name: 'Resend',
      purpose:
        'Tout l\'email transactionnel : codes de vérification, notifications d\'achat, relances d\'abonnement.',
      whenAbsent:
        'sendEmail() ne lève pas — elle journalise `[EMAIL:DEV]` et rend la main. Les écrans annoncent donc « email envoyé » alors que personne ne reçoit rien, y compris les codes de connexion.',
      env: [
        { name: 'RESEND_API_KEY', present: present('RESEND_API_KEY'), requirement: 'required' },
        {
          name: 'EMAIL_FROM',
          present: present('EMAIL_FROM'),
          requirement: 'optional',
          note: `Sans elle : ${from}`,
        },
      ],
      checks,
    },
    startedAt,
  )
}

// --- PawaPay -------------------------------------------------------------

async function probePawaPay(): Promise<Integration> {
  const startedAt = performance.now()
  const config = pawapayConfig()
  const checks: IntegrationCheck[] = []

  if (!isPawaPayConfigured() || !config) {
    checks.push({
      label: 'Jeton d\'API',
      state: 'absent',
      detail: 'PAWAPAY_API_TOKEN absent : aucun encaissement, aucun remboursement, aucun versement mobile money.',
    })
  } else {
    // `/v2/active-conf` authentifie ET dit ce que le compte marchand peut
    // réellement faire. Constater la présence du jeton ne prouverait rien.
    try {
      const conf = await activeConfiguration(true)
      const countries = (conf.countries ?? []).map((c) => c.country)
      checks.push({
        label: 'Configuration active',
        state: countries.length > 0 ? 'ok' : 'warn',
        detail: countries.length > 0
          ? `Jeton accepté. Pays ouverts : ${countries.join(', ')}.`
          : 'Jeton accepté, mais aucun pays n\'est ouvert sur ce compte : tout achat sera refusé par PROVIDER_NOT_SUPPORTED.',
      })

      const signedCallbacks = Boolean(conf.signatureConfiguration?.signedCallbacks)
      checks.push({
        label: 'Callbacks signés',
        state: signedCallbacks ? 'ok' : 'down',
        detail: signedCallbacks
          ? 'Activés côté PawaPay : la signature des callbacks est vérifiable.'
          : 'DÉSACTIVÉS côté PawaPay. Nos webhooks refusent tout callback non signé — donc aucun achat mobile money ne sera crédité. À activer dans le tableau de bord PawaPay.',
      })
    } catch (err) {
      checks.push({ label: 'Configuration active', state: 'down', detail: detailFrom(err) })
    }

    // Le bac à sable est le défaut délibéré de `pawapayConfig()` : se tromper
    // doit envoyer l'argent nulle part. En production, c'est l'inverse d'un
    // détail — les achats aboutissent sans qu'un franc ne bouge.
    const sandbox = config.baseUrl.includes('sandbox')
    checks.push({
      label: 'Environnement',
      state: sandbox && isProduction() ? 'down' : 'ok',
      detail: sandbox
        ? `Bac à sable (${config.baseUrl})${isProduction() ? ' — EN PRODUCTION : les paiements aboutissent sans mouvement d\'argent réel.' : '.'}`
        : `Production (${config.baseUrl}).`,
    })
  }

  return build(
    {
      key: 'pawapay',
      name: 'PawaPay',
      purpose: 'Mobile money : encaissements, remboursements et versements aux formateurs.',
      whenAbsent:
        'Cet adaptateur ne se dégrade jamais en silence : sans jeton, ses fonctions lèvent PAWAPAY_NOT_CONFIGURED et l\'achat est refusé. Les callbacks refusent tout, faute de pouvoir récupérer les clés publiques qui vérifient leur signature.',
      env: [
        { name: 'PAWAPAY_API_TOKEN', present: present('PAWAPAY_API_TOKEN'), requirement: 'required' },
        {
          name: 'PAWAPAY_ENVIRONMENT',
          present: present('PAWAPAY_ENVIRONMENT'),
          requirement: 'optional',
          note: 'Défaut : bac à sable.',
        },
        {
          name: 'PAWAPAY_BASE_URL',
          present: present('PAWAPAY_BASE_URL'),
          requirement: 'optional',
          note: 'Surcharge l\'URL déduite de l\'environnement.',
        },
        {
          name: 'PAWAPAY_CALLBACK_AUTHORITY',
          present: present('PAWAPAY_CALLBACK_AUTHORITY'),
          requirement: 'optional',
          note: 'À poser seulement si un proxy réécrit l\'en-tête Host : la signature couvre @authority, et une valeur erronée ferait échouer tous les callbacks.',
        },
      ],
      checks,
    },
    startedAt,
  )
}

// --- Stockage objet ------------------------------------------------------

async function probeStorage(): Promise<Integration> {
  const startedAt = performance.now()
  const config = storageConfig()
  const checks: IntegrationCheck[] = []

  if (!config) {
    checks.push({
      label: 'Identifiants',
      state: 'absent',
      detail: 'Configuration incomplète : les URLs présignées sont factices et AUCUN fichier n\'est réellement stocké.',
    })
  } else {
    // HeadBucket ne lit ni n'écrit d'objet : c'est le plus petit appel qui
    // prouve à la fois les identifiants, l'endpoint et l'existence du seau.
    const client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    })
    try {
      await withTimeout(client.send(new HeadBucketCommand({ Bucket: config.bucket })))
      checks.push({
        label: 'Seau joignable',
        state: 'ok',
        detail: `HeadBucket accepté sur « ${config.bucket} » (${config.endpoint}, région ${config.region}).`,
      })
    } catch (err) {
      checks.push({
        label: 'Seau joignable',
        state: 'down',
        detail: `« ${config.bucket} » : ${detailFrom(err)}`,
      })
    } finally {
      client.destroy()
    }
  }

  return build(
    {
      key: 'storage',
      name: 'Stockage objet (R2)',
      purpose:
        'Toutes les pièces déposées : documents KYC, contenus de cours, pièces jointes, et les replays quand Mux est absent.',
      whenAbsent:
        'Le repli est silencieux — une URL `data:placeholder-…` remplace l\'URL présignée, sans erreur. Un dépôt paraît réussir alors que le fichier n\'existe nulle part. C\'est ce défaut, resté invisible parce que le code lisait `R2_*` quand l\'environnement fournissait `AWS_*`, qui a fait naître cet écran.',
      env: [
        { name: 'AWS_ENDPOINT_URL', present: present('AWS_ENDPOINT_URL'), requirement: 'required' },
        { name: 'AWS_ACCESS_KEY_ID', present: present('AWS_ACCESS_KEY_ID'), requirement: 'required' },
        { name: 'AWS_SECRET_ACCESS_KEY', present: present('AWS_SECRET_ACCESS_KEY'), requirement: 'required' },
        {
          name: 'AWS_REGION',
          present: present('AWS_REGION'),
          requirement: 'optional',
          note: 'Défaut « auto », ce qu\'attendent les compatibles S3 sans régions.',
        },
        {
          name: 'AWS_BUCKET_NAME',
          present: present('AWS_BUCKET_NAME'),
          requirement: 'optional',
          note: 'Défaut « nkamva-dev ».',
        },
      ],
      checks,
    },
    startedAt,
  )
}

// --- Mux ------------------------------------------------------------------

async function probeMux(): Promise<Integration> {
  const startedAt = performance.now()
  const checks: IntegrationCheck[] = []

  if (!isMuxConfigured()) {
    checks.push({
      label: 'Jeton d\'API',
      state: 'absent',
      detail: 'MUX_TOKEN_ID / MUX_TOKEN_SECRET absents : les replays repassent par l\'egress fichier vers le stockage objet, et consomment donc le quota du formateur.',
    })
  } else {
    const auth = `Basic ${Buffer.from(`${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`).toString('base64')}`
    try {
      const res = await probeGet('https://api.mux.com/video/v1/assets?limit=1', { authorization: auth })
      checks.push({
        label: 'API vidéo',
        state: res.ok ? 'ok' : 'down',
        detail: res.ok
          ? 'Jeton accepté en lecture.'
          : `Refus HTTP ${res.status} — le jeton est posé mais Mux ne l'accepte pas.`,
      })
    } catch (err) {
      checks.push({ label: 'API vidéo', state: 'down', detail: detailFrom(err) })
    }

    // Mux échoue fermé, à l'inverse de Stripe : sans secret, la signature ne
    // peut pas être vérifiée, le webhook refuse, et le replay reste à
    // PROCESSING pour toujours. Pas un trou de sécurité — une impasse.
    const signed = present('MUX_WEBHOOK_SECRET')
    checks.push({
      label: 'Signature des webhooks',
      state: signed ? 'ok' : 'down',
      detail: signed
        ? 'Secret posé : /api/webhooks/mux peut vérifier la signature.'
        : 'MUX_WEBHOOK_SECRET absente : /api/webhooks/mux refuse tout callback, et aucun replay ne passera jamais de PROCESSING à prêt.',
    })
  }

  return build(
    {
      key: 'mux',
      name: 'Mux',
      purpose: 'Enregistrement, encodage et rediffusion des replays de sessions live.',
      whenAbsent:
        'createLiveStream() rend null et startRecording() retombe sur l\'egress fichier vers le stockage objet. La séance a bien lieu et le replay existe, mais il est hébergé chez nous — il consomme alors le quota du formateur (arbitrage 54).',
      env: [
        { name: 'MUX_TOKEN_ID', present: present('MUX_TOKEN_ID'), requirement: 'required' },
        { name: 'MUX_TOKEN_SECRET', present: present('MUX_TOKEN_SECRET'), requirement: 'required' },
        {
          name: 'MUX_WEBHOOK_SECRET',
          present: present('MUX_WEBHOOK_SECRET'),
          requirement: 'required',
          note: 'Sans elle, aucun replay ne devient jamais prêt.',
        },
      ],
      checks,
    },
    startedAt,
  )
}

// --- LiveKit -------------------------------------------------------------

async function probeLiveKit(): Promise<Integration> {
  const startedAt = performance.now()
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env
  const checks: IntegrationCheck[] = []

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || LIVEKIT_URL === 'undefined') {
    checks.push({
      label: 'Identifiants',
      state: 'absent',
      detail: 'Les trois clés sont nécessaires : sans elles, aucune session live ne peut s\'ouvrir.',
    })
  } else {
    // `listRooms` est en lecture seule et n'ouvre aucune salle facturée.
    //
    // Les clients serveur du SDK parlent Twirp sur HTTP, pas WebSocket : une
    // `LIVEKIT_URL` en `wss://` marche pour le navigateur et échoue ici. On
    // sonde donc l'URL configurée, puis son équivalent HTTP — pour distinguer
    // « fournisseur en panne » de « bon serveur, mauvais schéma ».
    const httpUrl = LIVEKIT_URL.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:')
    try {
      const rooms = await withTimeout(
        new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET).listRooms(),
      )
      checks.push({
        label: 'Salles listables',
        state: 'ok',
        detail: `Identifiants acceptés sur ${LIVEKIT_URL} — ${rooms.length} salle(s) ouverte(s).`,
      })
    } catch (err) {
      const asConfigured = detailFrom(err)
      let recovered = false
      if (httpUrl !== LIVEKIT_URL) {
        try {
          const rooms = await withTimeout(
            new RoomServiceClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET).listRooms(),
          )
          recovered = true
          checks.push({
            label: 'Salles listables',
            state: 'warn',
            detail: `Échec sur ${LIVEKIT_URL}, succès sur ${httpUrl} (${rooms.length} salle(s)). Les clients serveur du SDK parlent HTTP : LIVEKIT_URL doit porter https://.`,
          })
        } catch {
          // On garde l'échec de l'URL configurée : c'est celui qui compte.
        }
      }
      if (!recovered) {
        checks.push({ label: 'Salles listables', state: 'down', detail: asConfigured })
      }
    }
  }

  return build(
    {
      key: 'livekit',
      name: 'LiveKit',
      purpose: 'Transport temps réel des sessions live : salles, jetons de participation, egress.',
      whenAbsent:
        'Ce module ne lève pas : il rend null ou vide. L\'agenda des sessions, les replays déjà produits et la modération restent consultables ; seule la diffusion est impossible, et les écrans le disent.',
      env: [
        {
          name: 'LIVEKIT_URL',
          present: present('LIVEKIT_URL'),
          requirement: 'required',
          note: 'https:// côté serveur ; le navigateur, lui, accepte wss://.',
        },
        { name: 'LIVEKIT_API_KEY', present: present('LIVEKIT_API_KEY'), requirement: 'required' },
        { name: 'LIVEKIT_API_SECRET', present: present('LIVEKIT_API_SECRET'), requirement: 'required' },
      ],
      checks,
    },
    startedAt,
  )
}

// --- Rapport --------------------------------------------------------------

/**
 * Sonde les six fournisseurs en parallèle. Aucun appel n'écrit, aucun ne
 * facture, et chacun est borné dans le temps : l'écran s'ouvre même quand tout
 * est en panne.
 */
export async function probeIntegrations(): Promise<IntegrationsReport> {
  const integrations = await Promise.all([
    probeStripe(),
    probePawaPay(),
    probeResend(),
    probeStorage(),
    probeMux(),
    probeLiveKit(),
  ])

  const declared = process.env.ALLOW_PAYMENT_SIMULATION === '1'
  const active = declared && !isProduction()

  return {
    probedAt: new Date(),
    integrations,
    paymentSimulation: {
      active,
      declared,
      detail: active
        ? 'ALLOW_PAYMENT_SIMULATION=1 et NODE_ENV hors production : un achat dont le fournisseur est absent est crédité SANS paiement, et journalisé en PAYMENT_SIMULATED.'
        : declared
          ? 'ALLOW_PAYMENT_SIMULATION=1 est posée mais NODE_ENV vaut production : le raccourci reste fermé. À retirer de cet environnement — elle n\'y a rien à faire.'
          : 'Le raccourci est fermé : un fournisseur absent refuse l\'achat au lieu de le créditer.',
    },
  }
}

/** Compte les intégrations par état, pour le résumé en tête d'écran. */
export function countByState(integrations: Integration[]): Record<IntegrationState, number> {
  const counts: Record<IntegrationState, number> = { ok: 0, warn: 0, absent: 0, down: 0 }
  for (const integration of integrations) counts[integration.state] += 1
  return counts
}
