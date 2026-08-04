// ==========================================================================
// Envoi de SMS
// ==========================================================================
// Même patron que `sendEmail()` : sans identifiants, on **journalise au lieu
// d'échouer**. C'est ce qui permet de brancher les appels dès maintenant et de
// n'avoir plus qu'à poser des clés le jour venu — aucun code appelant ne
// changera.
//
// L'écart de l'arbitrage 24 était double, et documenté comme tel : la
// notification à l'ancien numéro n'était pas envoyée faute de fournisseur, mais
// **celle à l'ancienne adresse e-mail ne l'était pas non plus** alors que
// Resend est branché depuis le Lot 0. Le second n'attendait rien.
//
// ⚠️ Aucun fournisseur n'est choisi. Twilio, Vonage et les opérateurs locaux
// (Orange, MTN) exposent tous une API HTTP de forme voisine ; `sendSms` est
// écrite pour n'avoir qu'un corps de requête à changer. Le choix reste ouvert et
// engage un compte et une facture — il vous revient.
// ==========================================================================

export interface SendSmsParams {
  /** Numéro au format international, indicatif compris. */
  to: string
  body: string
  /** Étiquette de traçabilité, comme les `tags` de `sendEmail`. */
  tag?: string
}

/**
 * Un SMS coûte à l'envoi, contrairement à un e-mail : le message est court par
 * construction, et tronqué plutôt que fragmenté en trois segments facturés.
 */
const MAX_LENGTH = 320

export function isSmsConfigured(): boolean {
  return Boolean(process.env.SMS_API_URL && process.env.SMS_API_KEY)
}

/**
 * Normalise un numéro pour l'envoi. Rend `null` si rien d'exploitable n'en
 * sort : un numéro saisi à la main peut porter des espaces, des points ou un
 * préfixe local, et envoyer à une chaîne vide serait facturé pour rien.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = raw.replace(/[\s.\-()]/g, '')
  if (/^\+\d{8,15}$/.test(cleaned)) return cleaned
  if (/^\d{8,15}$/.test(cleaned)) {
    const country = process.env.SMS_DEFAULT_COUNTRY_CODE
    return country ? `${country}${cleaned.replace(/^0+/, '')}` : null
  }
  return null
}

export async function sendSms(params: SendSmsParams): Promise<void> {
  const to = normalizePhone(params.to)
  if (!to) {
    console.warn('[SMS:INVALID_NUMBER]', { raw: params.to, tag: params.tag })
    return
  }

  const body = params.body.length > MAX_LENGTH
    ? `${params.body.slice(0, MAX_LENGTH - 1)}…`
    : params.body

  if (!isSmsConfigured()) {
    console.log('[SMS:DEV]', { to, body, tag: params.tag })
    return
  }

  try {
    const res = await fetch(process.env.SMS_API_URL!, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.SMS_API_KEY}`,
      },
      body: JSON.stringify({
        to,
        from: process.env.SMS_SENDER_ID || 'NkamVa',
        message: body,
      }),
    })
    if (!res.ok) {
      console.error('[SMS:ERROR]', { to, status: res.status, tag: params.tag })
    }
  } catch (err) {
    // Un SMS perdu ne doit jamais faire échouer la transition métier qui l'a
    // déclenché — même règle que `deliverSideEffects` pour les e-mails.
    console.error('[SMS:FAILED]', { to, error: String(err), tag: params.tag })
  }
}
