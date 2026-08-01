// Lot 0 §5.2 — Webhook CinetPay
//
// Format réel (docs.cinetpay.com/api/1.0-en/checkout/notification, /hmac,
// /verification — vérifié le 2026-07-31, cf. décision n°15 dans
// docs/decisions-nkamva.md) :
// - POST en application/x-www-form-urlencoded, champ transaction cpm_trans_id
//   (pas "transactionId" comme supposé précédemment).
// - Un en-tête X-TOKEN est bien présent : HMAC-SHA256 de la concaténation
//   ordonnée des champs ci-dessous, avec la clé secrète marchande (distincte
//   de l'apikey). La spec Lot 0 fournie affirmait « pas de HMAC » — c'est
//   inexact pour l'API Checkout actuelle ; on vérifie ce token quand
//   CINETPAY_SECRET_KEY est configurée.
// - Quel que soit le résultat du HMAC, CinetPay recommande de ne jamais faire
//   confiance au contenu de la notification et d'appeler systématiquement
//   POST https://api-checkout.cinetpay.com/v2/payment/check (JSON,
//   { apikey, site_id, transaction_id }) pour obtenir le statut réel
//   (code "00" / data.status "ACCEPTED" si succès).
import { createHmac, timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/db'
import { creditWalletOnPurchase } from '@/lib/wallet'
import { auditStandalone } from '@/lib/audit'

// Ordre exact documenté pour la concaténation du HMAC.
const HMAC_FIELDS = [
  'cpm_site_id', 'cpm_trans_id', 'cpm_trans_date', 'cpm_amount', 'cpm_currency', 'signature',
  'payment_method', 'cel_phone_num', 'cpm_phone_prefixe', 'cpm_language', 'cpm_version',
  'cpm_payment_config', 'cpm_page_action', 'cpm_custom', 'cpm_designation', 'cpm_error_message',
] as const

function parseCinetPayBody(rawBody: string, contentType: string): Record<string, string> | null {
  const tryForm = (): Record<string, string> | null => {
    const parsed = Object.fromEntries(new URLSearchParams(rawBody))
    return parsed.cpm_trans_id ? parsed : null
  }
  const tryJson = (): Record<string, string> | null => {
    try {
      const json = JSON.parse(rawBody)
      if (json && typeof json === 'object' && json.cpm_trans_id) {
        return Object.fromEntries(Object.entries(json).map(([k, v]) => [k, String(v)]))
      }
    } catch { /* pas du JSON */ }
    return null
  }
  // Tolérant aux deux encodages : on tente d'abord celui indiqué par
  // Content-Type, puis l'autre en repli si le doute persiste.
  if (contentType.includes('application/json')) return tryJson() || tryForm()
  return tryForm() || tryJson()
}

function verifyXToken(fields: Record<string, string>, xToken: string | null, secretKey: string): boolean {
  if (!xToken) return false
  const data = HMAC_FIELDS.map(f => fields[f] ?? '').join('')
  const expected = createHmac('sha256', secretKey).update(data).digest('hex')
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(xToken, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

async function checkCinetPayTransaction(transactionId: string): Promise<'ACCEPTED' | 'REFUSED'> {
  if (!process.env.CINETPAY_API_KEY) {
    // Dev sans clé API : impossible d'appeler le "check" réel. Ce chemin n'est
    // emprunté que par la simulation dev de initiatePurchase.
    return 'ACCEPTED'
  }

  const res = await fetch('https://api-checkout.cinetpay.com/v2/payment/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      apikey: process.env.CINETPAY_API_KEY,
      site_id: process.env.CINETPAY_SITE_ID,
      transaction_id: transactionId,
    }),
  })
  if (!res.ok) return 'REFUSED'
  const data = await res.json().catch(() => null)
  return data?.code === '00' && data?.data?.status === 'ACCEPTED' ? 'ACCEPTED' : 'REFUSED'
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  const contentType = request.headers.get('content-type') || ''

  const fields = parseCinetPayBody(rawBody, contentType)
  if (!fields) {
    await auditStandalone({ action: 'WEBHOOK_MALFORMED', meta: { provider: 'CINETPAY', contentType, bodyPreview: rawBody.slice(0, 500) } })
    return new Response('Invalid payload', { status: 400 })
  }

  if (process.env.CINETPAY_SECRET_KEY) {
    const xToken = request.headers.get('x-token')
    if (!verifyXToken(fields, xToken, process.env.CINETPAY_SECRET_KEY)) {
      await auditStandalone({ action: 'WEBHOOK_SIGNATURE_INVALID', meta: { provider: 'CINETPAY', transactionId: fields.cpm_trans_id } })
      return new Response('Invalid signature', { status: 400 })
    }
  }
  if (process.env.CINETPAY_SITE_ID && fields.cpm_site_id && fields.cpm_site_id !== process.env.CINETPAY_SITE_ID) {
    await auditStandalone({ action: 'WEBHOOK_MALFORMED', meta: { provider: 'CINETPAY', reason: 'site_id_mismatch', received: fields.cpm_site_id } })
    return new Response('Invalid payload', { status: 400 })
  }

  const transactionId = fields.cpm_trans_id
  // La notification n'est jamais fiable telle quelle (recommandation CinetPay,
  // HMAC ou non) : le statut réel vient uniquement du rappel "check".
  const status = await checkCinetPayTransaction(transactionId)

  if (status === 'ACCEPTED') {
    await db.$transaction(async (tx) => {
      await creditWalletOnPurchase(tx, transactionId, 'CINETPAY')
    })
  } else {
    await auditStandalone({ action: 'CINETPAY_WEBHOOK_REFUSED', meta: { transactionId } })
  }

  return new Response(null, { status: 200 })
}
