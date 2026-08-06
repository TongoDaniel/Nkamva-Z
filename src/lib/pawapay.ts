// ==========================================================================
// Mobile money — adaptateur PawaPay
// ==========================================================================
// Remplace intégralement CinetPay. Tout ce qui touche au fournisseur vit ici,
// et rien d'autre : `purchases.ts`, `disputes.ts` et `payouts.ts` ne connaissent
// que les verbes de ce module.
//
// Ce que PawaPay couvre, et que CinetPay ne couvrait pas :
//   · Deposits  — encaisser (remplace l'initiation CinetPay, qui n'existait pas)
//   · Refunds   — rembourser (remplace `attemptCinetPayRefund`, dont l'URL était
//                 devinée et échouait donc toujours vers une tâche manuelle)
//   · Payouts   — verser (remplace le virement manuel derrière `markPayoutPaid`)
//
// ⚠️ **Ce module ne se dégrade jamais en silence.** C'est la rupture délibérée
// avec le patron qui régnait ici : `initiatePurchase` créditait un achat sans
// paiement dès que `STRIPE_SECRET_KEY` manquait, et le webhook CinetPay
// acceptait tout sans `CINETPAY_SECRET_KEY`. Une variable d'environnement
// absente est une panne de configuration, pas une autorisation. Sans clés, les
// fonctions de ce fichier lèvent `PAWAPAY_NOT_CONFIGURED` — elles ne rendent
// jamais un succès de complaisance.
//
// Contrat vérifié sur docs.pawapay.io le 6 août 2026 (API v2).
// ==========================================================================

import { createHash, createPublicKey, createVerify, verify as cryptoVerify, timingSafeEqual } from 'node:crypto'
import type { MobileMoneyOperator } from '@prisma/client'

// --- Configuration ---------------------------------------------------------

/** Délai au-delà duquel un appel fournisseur est abandonné. */
const REQUEST_TIMEOUT_MS = 30_000

export interface PawaPayConfig {
  baseUrl: string
  token: string
}

/**
 * `PAWAPAY_BASE_URL` l'emporte quand elle est posée ; sinon l'environnement
 * choisit. Le défaut est le **bac à sable** : se tromper doit envoyer l'argent
 * nulle part, pas en production.
 */
export function pawapayConfig(): PawaPayConfig | null {
  const token = process.env.PAWAPAY_API_TOKEN
  if (!token) return null
  const baseUrl =
    process.env.PAWAPAY_BASE_URL?.replace(/\/$/, '') ||
    (process.env.PAWAPAY_ENVIRONMENT === 'production'
      ? 'https://api.pawapay.io'
      : 'https://api.sandbox.pawapay.io')
  return { baseUrl, token }
}

export function isPawaPayConfigured(): boolean {
  return pawapayConfig() !== null
}

function requireConfig(): PawaPayConfig {
  const config = pawapayConfig()
  if (!config) throw new Error('PAWAPAY_NOT_CONFIGURED')
  return config
}

// --- Couche HTTP -----------------------------------------------------------

export class PawaPayError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly failureCode: string | null,
    readonly body: unknown,
  ) {
    super(message)
    this.name = 'PawaPayError'
  }
}

async function call<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<T> {
  const { baseUrl, token } = requireConfig()

  let res: Response
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
    throw new PawaPayError(timedOut ? 'PAWAPAY_TIMEOUT' : `PAWAPAY_NETWORK_ERROR: ${String(err)}`, null, null, null)
  }

  const payload = await res.json().catch(() => null)

  if (!res.ok) {
    const failureCode =
      (payload as { failureReason?: { failureCode?: string } } | null)?.failureReason?.failureCode ?? null
    throw new PawaPayError(`PAWAPAY_HTTP_${res.status}`, res.status, failureCode, payload)
  }

  return payload as T
}

// --- Montants et opérateurs ------------------------------------------------

/**
 * PawaPay transporte les montants en **chaîne**, et XAF n'admet aucune
 * décimale (`decimalsInAmount: "NONE"` dans `/v2/active-conf`). Comme
 * `amountFcfa` est déjà un entier, la conversion est directe — mais elle passe
 * par ici pour que le jour où une devise à décimales apparaît, un seul endroit
 * change.
 */
export function amountToPawaPay(amountFcfa: number): string {
  if (!Number.isInteger(amountFcfa) || amountFcfa <= 0) throw new Error('INVALID_AMOUNT')
  return String(amountFcfa)
}

export const PAWAPAY_CURRENCY = 'XAF'

/**
 * Correspondance opérateur × pays → code fournisseur PawaPay.
 *
 * PawaPay nomme ses opérateurs `{OPÉRATEUR}_{SERVICE}_{PAYS}` — `MTN_MOMO_CMR`,
 * `ORANGE_CMR` — là où notre énumération est générique. La table ci-dessous ne
 * fait donc pas foi à elle seule : `assertProviderOperational()` la confronte à
 * `/v2/active-conf`, qui dit ce que **ce compte marchand** peut réellement
 * encaisser aujourd'hui.
 *
 * WAVE n'y figure pas : Wave n'est pas distribué par PawaPay. Un formateur qui
 * a enregistré un compte Wave reste sur le circuit manuel — voir
 * `payouts.ts`.
 */
const PROVIDER_CODES: Partial<Record<MobileMoneyOperator, Record<string, string>>> = {
  MTN_MOMO: { CM: 'MTN_MOMO_CMR', CI: 'MTN_MOMO_CIV', BJ: 'MTN_MOMO_BEN', CG: 'MTN_MOMO_COG', GH: 'MTN_MOMO_GHA', RW: 'MTN_MOMO_RWA', UG: 'MTN_MOMO_UGA', ZM: 'MTN_MOMO_ZMB' },
  ORANGE_MONEY: { CM: 'ORANGE_CMR', CI: 'ORANGE_CIV', SN: 'ORANGE_SEN', BF: 'ORANGE_BFA', ML: 'ORANGE_MLI', CD: 'ORANGE_COD' },
  AIRTEL_MONEY: { CD: 'AIRTEL_COD', KE: 'AIRTEL_KEN', MW: 'AIRTEL_MWI', NG: 'AIRTEL_NGA', RW: 'AIRTEL_RWA', TZ: 'AIRTEL_TZA', UG: 'AIRTEL_UGA', ZM: 'AIRTEL_ZMB' },
  M_PESA: { KE: 'MPESA_KEN', TZ: 'VODACOM_TZA', LS: 'MPESA_LSO', MZ: 'VODACOM_MOZ' },
}

/** ISO 3166-1 alpha-2 (le nôtre) → alpha-3 (celui de PawaPay). */
const ALPHA3: Record<string, string> = {
  CM: 'CMR', CI: 'CIV', SN: 'SEN', BF: 'BFA', ML: 'MLI', BJ: 'BEN', TG: 'TGO',
  CD: 'COD', CG: 'COG', GA: 'GAB', GH: 'GHA', NG: 'NGA', KE: 'KEN', TZ: 'TZA',
  UG: 'UGA', RW: 'RWA', ZM: 'ZMB', MW: 'MWI', MZ: 'MOZ', LS: 'LSO', SL: 'SLE', ET: 'ETH',
}

export function pawapayCountry(countryCode: string): string | null {
  return ALPHA3[countryCode.toUpperCase()] ?? null
}

export function pawapayProviderCode(
  operator: MobileMoneyOperator,
  countryCode: string,
): string | null {
  return PROVIDER_CODES[operator]?.[countryCode.toUpperCase()] ?? null
}

/**
 * Normalise un numéro au format MSISDN attendu : **chiffres uniquement**, sans
 * `+`, sans espace, sans séparateur. Le préfixe pays est ajouté quand il manque,
 * parce que c'est la faute de saisie la plus banale — `670 00 00 00` pour un
 * numéro camerounais.
 */
export function toMsisdn(phone: string, countryPrefix: string): string {
  const digits = phone.replace(/\D/g, '')
  if (!digits) throw new Error('INVALID_PHONE_NUMBER')
  return digits.startsWith(countryPrefix) ? digits : `${countryPrefix}${digits}`
}

// --- Configuration active --------------------------------------------------

export interface ActiveOperationConfig {
  minAmount: string
  maxAmount: string
  decimalsInAmount: 'NONE' | 'TWO_PLACES'
  status: 'OPERATIONAL' | 'DELAYED' | 'CLOSED'
}

export interface ActiveConfiguration {
  companyName?: string
  signatureConfiguration?: { signedRequestsOnly?: boolean; signedCallbacks?: boolean }
  countries: Array<{
    country: string
    prefix: string
    providers: Array<{
      provider: string
      displayName?: string
      currencies: Array<{
        currency: string
        operationTypes: Partial<Record<'DEPOSIT' | 'PAYOUT' | 'REFUND' | 'NAME_LOOKUP', ActiveOperationConfig>>
      }>
    }>
  }>
}

let configCache: { at: number; value: ActiveConfiguration } | null = null
const CONFIG_TTL_MS = 10 * 60 * 1000

/**
 * `/v2/active-conf` — ce que ce compte marchand peut réellement faire, avec les
 * bornes de montant par opérateur. Mise en cache dix minutes : c'est une donnée
 * de configuration, pas un état de transaction, et l'interroger à chaque achat
 * ajouterait un aller-retour au chemin critique du paiement.
 */
export async function activeConfiguration(force = false): Promise<ActiveConfiguration> {
  if (!force && configCache && Date.now() - configCache.at < CONFIG_TTL_MS) return configCache.value
  const value = await call<ActiveConfiguration>('GET', '/v2/active-conf')
  configCache = { at: Date.now(), value }
  return value
}

export interface ProviderCapability {
  provider: string
  country: string
  prefix: string
  currency: string
  operation: ActiveOperationConfig
}

/**
 * Retrouve la capacité déclarée pour un opérateur et un type d'opération.
 * Rend `null` quand le compte marchand n'est pas configuré pour ce couple —
 * situation qui doit refuser l'achat, jamais le laisser partir en espérant.
 */
export async function providerCapability(
  providerCode: string,
  operationType: 'DEPOSIT' | 'PAYOUT' | 'REFUND',
  currency = PAWAPAY_CURRENCY,
): Promise<ProviderCapability | null> {
  const conf = await activeConfiguration()
  for (const country of conf.countries ?? []) {
    for (const provider of country.providers ?? []) {
      if (provider.provider !== providerCode) continue
      for (const entry of provider.currencies ?? []) {
        if (entry.currency !== currency) continue
        const operation = entry.operationTypes?.[operationType]
        if (!operation) return null
        return { provider: providerCode, country: country.country, prefix: country.prefix, currency, operation }
      }
    }
  }
  return null
}

/**
 * Refuse tôt et avec un motif lisible plutôt que de laisser le fournisseur
 * rejeter la transaction : un montant hors bornes ou un opérateur en panne se
 * savent avant d'ouvrir quoi que ce soit.
 */
export async function assertOperational(
  providerCode: string,
  operationType: 'DEPOSIT' | 'PAYOUT' | 'REFUND',
  amountFcfa: number,
): Promise<ProviderCapability> {
  const capability = await providerCapability(providerCode, operationType)
  if (!capability) throw new Error('PROVIDER_NOT_SUPPORTED')
  if (capability.operation.status === 'CLOSED') throw new Error('PROVIDER_TEMPORARILY_UNAVAILABLE')
  const min = Number(capability.operation.minAmount)
  const max = Number(capability.operation.maxAmount)
  if (Number.isFinite(min) && amountFcfa < min) throw new Error('AMOUNT_BELOW_PROVIDER_MINIMUM')
  if (Number.isFinite(max) && amountFcfa > max) throw new Error('AMOUNT_ABOVE_PROVIDER_MAXIMUM')
  return capability
}

// --- Types de transaction --------------------------------------------------

export type InitiationStatus = 'ACCEPTED' | 'REJECTED' | 'DUPLICATE_IGNORED'
export type TransactionStatus = 'ACCEPTED' | 'PROCESSING' | 'IN_RECONCILIATION' | 'COMPLETED' | 'FAILED'

export interface FailureReason {
  failureCode: string
  failureMessage?: string
}

export interface InitiationResponse {
  status: InitiationStatus
  created?: string
  failureReason?: FailureReason
}

export interface AccountDetails {
  phoneNumber: string
  provider: string
}

/**
 * Forme commune des callbacks et de la consultation de statut. PawaPay POSTe
 * cet objet **à plat** dans le callback, et l'enveloppe dans `{status, data}`
 * sur `GET /v2/deposits/{id}` : `checkDeposit` déballe pour que l'appelant n'ait
 * qu'une seule forme à connaître.
 */
export interface TransactionSnapshot {
  depositId?: string
  payoutId?: string
  refundId?: string
  status: TransactionStatus
  amount?: string
  currency?: string
  country?: string
  payer?: { type: string; accountDetails: AccountDetails }
  recipient?: { type: string; accountDetails: AccountDetails }
  customerMessage?: string
  clientReferenceId?: string
  created?: string
  providerTransactionId?: string
  failureReason?: FailureReason
  metadata?: Record<string, string>
}

/** `{status: FOUND|NOT_FOUND, data}` — enveloppe des consultations de statut. */
interface LookupResponse {
  status: 'FOUND' | 'NOT_FOUND'
  data?: TransactionSnapshot
}

/**
 * `customerMessage` est borné à 4–22 caractères par PawaPay et apparaît sur le
 * relevé du client. Un titre de ressource dépasse presque toujours : on tronque
 * plutôt que de laisser le fournisseur rejeter la transaction entière.
 */
export function customerMessage(raw: string): string {
  // Sans `\p{L}` : la cible du projet est ES2017, où les classes Unicode ne sont
  // pas disponibles. La plage `À-ÿ` couvre les accents du français, ce qui
  // suffit ici — le reste tombe, et c'est préférable à un rejet du fournisseur.
  const cleaned = raw.replace(/[^A-Za-zÀ-ÿ0-9 .-]/g, '').trim()
  if (cleaned.length < 4) return 'NkamVa'
  return cleaned.slice(0, 22)
}

// --- Deposits --------------------------------------------------------------

export interface RequestDepositParams {
  /** UUID v4 — c'est **notre** identifiant, et la clé d'idempotence de PawaPay. */
  depositId: string
  phoneNumber: string
  provider: string
  amountFcfa: number
  customerMessage: string
  clientReferenceId?: string
  metadata?: Record<string, string>
}

function metadataArray(metadata?: Record<string, string>): Array<Record<string, string>> | undefined {
  if (!metadata) return undefined
  // PawaPay attend un tableau d'objets à une clé, plafonné à dix entrées.
  return Object.entries(metadata).slice(0, 10).map(([key, value]) => ({ [key]: String(value) }))
}

export async function requestDeposit(params: RequestDepositParams): Promise<InitiationResponse> {
  return call<InitiationResponse>('POST', '/v2/deposits', {
    depositId: params.depositId,
    payer: {
      type: 'MMO',
      accountDetails: { phoneNumber: params.phoneNumber, provider: params.provider },
    },
    amount: amountToPawaPay(params.amountFcfa),
    currency: PAWAPAY_CURRENCY,
    customerMessage: customerMessage(params.customerMessage),
    ...(params.clientReferenceId ? { clientReferenceId: params.clientReferenceId } : {}),
    ...(metadataArray(params.metadata) ? { metadata: metadataArray(params.metadata) } : {}),
  })
}

export async function checkDeposit(depositId: string): Promise<TransactionSnapshot | null> {
  const res = await call<LookupResponse>('GET', `/v2/deposits/${encodeURIComponent(depositId)}`)
  return res.status === 'FOUND' && res.data ? res.data : null
}

// --- Payouts ---------------------------------------------------------------

export interface RequestPayoutParams {
  payoutId: string
  phoneNumber: string
  provider: string
  amountFcfa: number
  customerMessage: string
  clientReferenceId?: string
  metadata?: Record<string, string>
}

export async function requestPayout(params: RequestPayoutParams): Promise<InitiationResponse> {
  return call<InitiationResponse>('POST', '/v2/payouts', {
    payoutId: params.payoutId,
    recipient: {
      type: 'MMO',
      accountDetails: { phoneNumber: params.phoneNumber, provider: params.provider },
    },
    amount: amountToPawaPay(params.amountFcfa),
    currency: PAWAPAY_CURRENCY,
    customerMessage: customerMessage(params.customerMessage),
    ...(params.clientReferenceId ? { clientReferenceId: params.clientReferenceId } : {}),
    ...(metadataArray(params.metadata) ? { metadata: metadataArray(params.metadata) } : {}),
  })
}

export async function checkPayout(payoutId: string): Promise<TransactionSnapshot | null> {
  const res = await call<LookupResponse>('GET', `/v2/payouts/${encodeURIComponent(payoutId)}`)
  return res.status === 'FOUND' && res.data ? res.data : null
}

// --- Refunds ---------------------------------------------------------------

export interface RequestRefundParams {
  refundId: string
  /** Le dépôt à rembourser — PawaPay retrouve seul le compte à recréditer. */
  depositId: string
  amountFcfa: number
  clientReferenceId?: string
  metadata?: Record<string, string>
}

export async function requestRefund(params: RequestRefundParams): Promise<InitiationResponse> {
  return call<InitiationResponse>('POST', '/v2/refunds', {
    refundId: params.refundId,
    depositId: params.depositId,
    amount: amountToPawaPay(params.amountFcfa),
    currency: PAWAPAY_CURRENCY,
    ...(params.clientReferenceId ? { clientReferenceId: params.clientReferenceId } : {}),
    ...(metadataArray(params.metadata) ? { metadata: metadataArray(params.metadata) } : {}),
  })
}

export async function checkRefund(refundId: string): Promise<TransactionSnapshot | null> {
  const res = await call<LookupResponse>('GET', `/v2/refunds/${encodeURIComponent(refundId)}`)
  return res.status === 'FOUND' && res.data ? res.data : null
}

// --- Nom du titulaire ------------------------------------------------------

/**
 * ⚠️ ÉCART ASSUMÉ, hérité et non résolu par la migration.
 *
 * `/v2/active-conf` annonce un type d'opération `NAME_LOOKUP`, mais **aucun
 * endpoint public de vérification du nom n'est documenté dans l'API v2** au
 * 6 août 2026. On ne devine pas d'URL : c'est exactement ce qu'avait fait
 * `attemptCinetPayRefund`, dont l'adresse inventée échouait à chaque appel en
 * envoyant silencieusement le dossier en traitement manuel.
 *
 * Conséquence : `fetchOperatorAccountName` (payout-methods.ts) continue de
 * rendre `null`, donc aucun RIB mobile money ne s'auto-vérifie et tout passe en
 * revue Finances. C'est le comportement d'avant la migration, ni meilleur ni
 * pire.
 *
 * À lever en demandant à PawaPay si le produit « name lookup » est activable
 * sur le compte, et par quel endpoint. C'est ici, et nulle part ailleurs, qu'il
 * se branchera.
 */
export async function lookupAccountName(
  _phoneNumber: string,
  providerCode: string,
): Promise<string | null> {
  const capability = await providerCapability(providerCode, 'DEPOSIT').catch(() => null)
  // On journalise l'écart plutôt que de le taire : si la configuration active
  // annonce NAME_LOOKUP, c'est le signal qu'il est temps de brancher.
  if (capability) {
    const conf = await activeConfiguration().catch(() => null)
    const advertised = conf?.countries
      ?.flatMap((c) => c.providers ?? [])
      .find((p) => p.provider === providerCode)
      ?.currencies?.some((c) => c.operationTypes?.NAME_LOOKUP)
    if (advertised) {
      console.warn('[PAWAPAY:NAME_LOOKUP_ADVERTISED_BUT_UNIMPLEMENTED]', { providerCode })
    }
  }
  return null
}

// --- Signature des callbacks (RFC 9421) ------------------------------------
//
// PawaPay signe ses callbacks selon *HTTP Message Signatures*. Quatre en-têtes
// participent : `Content-Digest` (empreinte du corps), `Signature-Date`,
// `Signature-Input` (les composants couverts, l'identifiant de clé et
// l'algorithme) et `Signature` (la signature elle-même).
//
// La vérification est **obligatoire et sans repli**. Le webhook CinetSPay qu'on
// remplace acceptait tout quand son secret manquait ; ici, l'absence de clé, de
// signature ou de concordance rend `false`, et la route répond 401.

interface SignatureInput {
  label: string
  components: string[]
  params: string
  keyid: string | null
  alg: string | null
}

/** `sig1=("@method" "@authority");created=1;keyid="K";alg="ecdsa-p256-sha256"` */
function parseSignatureInput(header: string): SignatureInput | null {
  // Sans le drapeau `s` (ES2018, hors cible du projet) : un en-tête HTTP tient
  // sur une ligne, `.` n'a donc jamais de saut de ligne à franchir.
  const match = header.match(/^([A-Za-z0-9_-]+)=(\((.*?)\)(.*))$/)
  if (!match) return null
  const [, label, params, componentList, tail] = match
  const components = [...componentList.matchAll(/"([^"]+)"/g)].map((m) => m[1])
  if (components.length === 0) return null
  return {
    label,
    components,
    params,
    keyid: tail.match(/keyid="([^"]+)"/)?.[1] ?? null,
    alg: tail.match(/alg="([^"]+)"/)?.[1] ?? null,
  }
}

/** `sig1=:BASE64:` */
function parseSignature(header: string, label: string): Buffer | null {
  const match = header.match(new RegExp(`(?:^|,\\s*)${label}=:([^:]+):`))
  if (!match) return null
  try {
    return Buffer.from(match[1], 'base64')
  } catch {
    return null
  }
}

/** `sha-256=:BASE64:` — on accepte SHA-256 et SHA-512. */
function verifyContentDigest(header: string, rawBody: string): boolean {
  const match = header.match(/(sha-256|sha-512)=:([^:]+):/i)
  if (!match) return false
  const algorithm = match[1].toLowerCase() === 'sha-512' ? 'sha512' : 'sha256'
  const expected = createHash(algorithm).update(rawBody, 'utf8').digest()
  let received: Buffer
  try {
    received = Buffer.from(match[2], 'base64')
  } catch {
    return false
  }
  if (expected.length !== received.length) return false
  return timingSafeEqual(expected, received)
}

let keyCache: { at: number; keys: Map<string, string> } | null = null
const KEY_TTL_MS = 60 * 60 * 1000

/**
 * Les clés publiques changent rarement ; on les garde une heure. Un `keyid`
 * inconnu force malgré tout un rafraîchissement immédiat : c'est exactement le
 * signal d'une rotation de clé côté PawaPay, et attendre l'expiration du cache
 * rejetterait une heure de callbacks légitimes.
 */
async function publicKeyFor(keyid: string): Promise<string | null> {
  const fresh = keyCache && Date.now() - keyCache.at < KEY_TTL_MS
  if (fresh && keyCache!.keys.has(keyid)) return keyCache!.keys.get(keyid)!

  const list = await call<Array<{ id: string; key: string }>>('GET', '/v2/public-key/http')
  keyCache = { at: Date.now(), keys: new Map(list.map((k) => [k.id, k.key])) }
  return keyCache.keys.get(keyid) ?? null
}

/**
 * Vérifie une signature. Les algorithmes admis sont ceux annoncés par PawaPay ;
 * tout autre valeur est refusée plutôt qu'interprétée — accepter un algorithme
 * inconnu reviendrait à laisser l'émetteur choisir la force de sa propre
 * signature.
 */
function verifyWithKey(alg: string, base: string, signature: Buffer, pem: string): boolean {
  const key = createPublicKey(pem)
  const data = Buffer.from(base, 'utf8')

  switch (alg) {
    // ECDSA : la RFC impose la forme brute r‖s, pas l'enveloppe DER d'OpenSSL.
    case 'ecdsa-p256-sha256':
      return cryptoVerify('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, signature)
    case 'ecdsa-p384-sha384':
      return cryptoVerify('sha384', data, { key, dsaEncoding: 'ieee-p1363' }, signature)
    case 'rsa-pss-sha512':
      return cryptoVerify(
        'sha512',
        data,
        { key, padding: 1 << 6 /* RSA_PKCS1_PSS_PADDING */, saltLength: 64 },
        signature,
      )
    case 'rsa-v1_5-sha256': {
      const verifier = createVerify('sha256')
      verifier.update(data)
      verifier.end()
      return verifier.verify(key, signature)
    }
    default:
      return false
  }
}

export interface CallbackRequestFacts {
  method: string
  /** Hôte public tel que PawaPay l'a appelé — c'est lui qui a été signé. */
  authority: string
  /** Chemin seul, sans requête. */
  path: string
  headers: Headers
  rawBody: string
}

/**
 * Rend `true` seulement si la signature couvre bien cette requête-ci.
 *
 * Le `@authority` mérite un mot : c'est l'hôte **public** appelé par PawaPay.
 * Derrière un proxy qui réécrit `Host`, il faut le rétablir — d'où
 * `PAWAPAY_CALLBACK_AUTHORITY`. Le Caddyfile du dépôt préserve `Host`, donc le
 * repli sur l'en-tête convient tant qu'on reste derrière lui.
 */
export async function verifyCallbackSignature(facts: CallbackRequestFacts): Promise<boolean> {
  const signatureInputHeader = facts.headers.get('signature-input')
  const signatureHeader = facts.headers.get('signature')
  const contentDigest = facts.headers.get('content-digest')

  if (!signatureInputHeader || !signatureHeader || !contentDigest) return false
  if (!verifyContentDigest(contentDigest, facts.rawBody)) return false

  const input = parseSignatureInput(signatureInputHeader)
  if (!input?.keyid || !input.alg) return false

  const signature = parseSignature(signatureHeader, input.label)
  if (!signature) return false

  // Construction de la base de signature, dans l'ordre exact annoncé par
  // `Signature-Input` : toute liberté prise ici invalide la vérification.
  const lines: string[] = []
  for (const component of input.components) {
    let value: string | null
    switch (component) {
      case '@method':
        value = facts.method.toUpperCase()
        break
      case '@authority':
        value = facts.authority
        break
      case '@path':
        value = facts.path
        break
      default:
        // Un composant dérivé qu'on ne sait pas reconstituer ne doit pas être
        // ignoré : on refuse, sinon la couverture réelle serait moindre que la
        // couverture annoncée.
        if (component.startsWith('@')) return false
        value = facts.headers.get(component)
    }
    if (value === null) return false
    lines.push(`"${component}": ${value}`)
  }
  lines.push(`"@signature-params": ${input.params}`)
  const base = lines.join('\n')

  let pem: string | null
  try {
    pem = await publicKeyFor(input.keyid)
  } catch (err) {
    console.error('[PAWAPAY:PUBLIC_KEY_FETCH_FAILED]', String(err))
    return false
  }
  if (!pem) return false

  try {
    return verifyWithKey(input.alg, base, signature, pem)
  } catch (err) {
    console.error('[PAWAPAY:SIGNATURE_VERIFY_ERROR]', String(err))
    return false
  }
}

/** Hôte public à utiliser pour `@authority`. */
export function callbackAuthority(request: Request): string {
  return (
    process.env.PAWAPAY_CALLBACK_AUTHORITY ||
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    new URL(request.url).host
  )
}
