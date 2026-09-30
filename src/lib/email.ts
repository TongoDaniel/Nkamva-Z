import { Resend } from 'resend'
let resend: Resend | null = null
function getResend(): Resend | null { if (!process.env.RESEND_API_KEY) return null; if (!resend) resend = new Resend(process.env.RESEND_API_KEY); return resend }

export interface SendEmailParams { to: string; subject: string; html: string; text?: string; tags?: string[] }

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const client = getResend()
  const from = process.env.EMAIL_FROM || 'NKAMVA <noreply@nkamva.com>'
  if (!client) { console.log('[EMAIL:DEV]', { from, to: params.to, subject: params.subject }); return }
  const { error } = await client.emails.send({ from, to: params.to, subject: params.subject, html: params.html, text: params.text, tags: params.tags?.map(name => ({ name, value: 'true' })) })
  if (error) { console.error('[EMAIL:ERROR]', { to: params.to, subject: params.subject, error }); throw new Error(`Email send failed: ${error.message}`) }
}

// --- Gabarit ---------------------------------------------------------------

// Tokens de marque repris de `globals.css`. Ils sont recopiés en dur : un client
// mail ne charge ni feuille de style externe ni variable CSS, tout doit être en
// style inline dans le document.
const PAPER = '#f6f3ec'
const INK = '#15211b'
const INK_2 = '#4c5a52'
const BRAND = '#1c5ed0'
const LINE = '#e2ded3'

export interface SimpleEmailParams {
  /** Titre affiché en tête du corps. Ce n'est pas l'objet du message. */
  title: string
  /** Paragraphes du corps, en texte brut : ils sont échappés au rendu. */
  paragraphs: string[]
  /** Valeur à mettre en avant — un code de vérification, un montant. */
  highlight?: string
  cta?: { label: string; url: string }
  /** Mention de fin : délai d'expiration, « si vous n'êtes pas à l'origine… ». */
  footnote?: string
}

/**
 * Échappe le contenu utilisateur avant insertion dans le corps HTML. Un nom qui
 * contient `<` casserait la mise en page au mieux, injecterait du balisage dans
 * la boîte du support au pire.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Rend un email transactionnel à la marque et sa version texte, à partir de
 * contenu brut. Rendre les deux d'une seule source évite qu'elles divergent :
 * jusqu'ici chaque appelant écrivait son HTML inline et son `text` à la main,
 * et plusieurs ne fournissaient pas de version texte du tout.
 *
 * Mise en page en tableau et styles inline : c'est ce que comprennent Outlook
 * et Gmail, qui ignorent une bonne partie du CSS moderne.
 */
export function renderSimpleEmail(params: SimpleEmailParams): { html: string; text: string } {
  // `pre-line` : un paragraphe peut contenir des retours à la ligne (le corps
  // d'un message de contact, par exemple). Sans lui, tout arrive en un bloc.
  const body = params.paragraphs
    .map(p => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;white-space:pre-line;color:${INK_2}">${escapeHtml(p)}</p>`)
    .join('\n        ')

  const highlight = params.highlight
    ? `<p style="margin:20px 0;padding:14px 20px;background:${PAPER};border-radius:10px;font-size:26px;font-weight:700;letter-spacing:6px;text-align:center;color:${INK}">${escapeHtml(params.highlight)}</p>`
    : ''

  // Le libellé est échappé, l'URL ne l'est pas de la même façon : elle passe par
  // `encodeURI` pour rester une URL valide tout en neutralisant les guillemets
  // qui sortiraient de l'attribut.
  const cta = params.cta
    ? `<p style="margin:24px 0"><a href="${encodeURI(params.cta.url).replace(/"/g, '%22')}" style="display:inline-block;padding:12px 24px;background:${BRAND};color:#ffffff;border-radius:999px;font-size:15px;font-weight:600;text-decoration:none">${escapeHtml(params.cta.label)}</a></p>`
    : ''

  const footnote = params.footnote
    ? `<p style="margin:22px 0 0;font-size:13px;line-height:1.5;color:${INK_2}">${escapeHtml(params.footnote)}</p>`
    : ''

  const html = `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:${PAPER}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:16px">
        <tr><td style="padding:28px 32px 0">
          <p style="margin:0;font-size:18px;font-weight:700;letter-spacing:-0.02em;color:${BRAND}">NKAMVA</p>
        </td></tr>
        <tr><td style="padding:16px 32px 32px">
          <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;font-weight:700;color:${INK}">${escapeHtml(params.title)}</h1>
        ${body}
        ${highlight}
        ${cta}
        ${footnote}
        </td></tr>
      </table>
      <p style="margin:20px 0 0;font-size:12px;color:${INK_2}">NKAMVA — des ressources créées par des formateurs africains</p>
    </td></tr>
  </table>
</body>
</html>`

  const text = [
    params.title,
    '',
    ...params.paragraphs,
    ...(params.highlight ? ['', params.highlight] : []),
    ...(params.cta ? ['', `${params.cta.label} : ${params.cta.url}`] : []),
    ...(params.footnote ? ['', params.footnote] : []),
    '',
    '— L\'équipe NKAMVA',
  ].join('\n')

  return { html, text }
}
