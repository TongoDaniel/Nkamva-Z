import { Resend } from 'resend'
let resend: Resend | null = null
function getResend(): Resend | null { if (!process.env.RESEND_API_KEY) return null; if (!resend) resend = new Resend(process.env.RESEND_API_KEY); return resend }

export interface SendEmailParams { to: string; subject: string; html: string; text?: string; tags?: string[] }

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const client = getResend()
  const from = process.env.EMAIL_FROM || 'NkamVa <noreply@nkamva.com>'
  if (!client) { console.log('[EMAIL:DEV]', { from, to: params.to, subject: params.subject }); return }
  const { error } = await client.emails.send({ from, to: params.to, subject: params.subject, html: params.html, text: params.text, tags: params.tags?.map(name => ({ name, value: 'true' })) })
  if (error) { console.error('[EMAIL:ERROR]', { to: params.to, subject: params.subject, error }); throw new Error(`Email send failed: ${error.message}`) }
}
