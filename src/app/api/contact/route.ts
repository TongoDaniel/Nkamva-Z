// Formulaire de contact public
//
// Aucun modèle ne stocke les messages : ils partent par e-mail au support, et
// l'audit garde la trace de l'envoi sans le contenu. Créer une table pour des
// messages que personne ne relirait dans l'application n'apporterait rien.
import { success, error, parseBody } from '@/lib/api'
import { sendEmail } from '@/lib/email'
import { auditStandalone } from '@/lib/audit'
import { checkRateLimit, getRateLimitIdentifier } from '@/lib/rate-limit'
import { z } from 'zod'

const SUBJECTS = {
  ACHAT: 'Un achat ou un paiement',
  ACCES: "Un problème d'accès à une ressource",
  REMBOURSEMENT: 'Un remboursement ou une contestation',
  FORMATEUR: 'Devenir formateur ou publier',
  COMPTE: 'Mon compte',
  AUTRE: 'Autre sujet',
} as const

const ContactSchema = z.object({
  name: z.string().trim().min(2, 'Nom trop court').max(120),
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide'),
  subject: z.enum(Object.keys(SUBJECTS) as [keyof typeof SUBJECTS]),
  message: z.string().trim().min(20, 'Détaillez votre demande').max(5000),
})

/** Échappe le contenu utilisateur avant de l'insérer dans le corps HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function POST(request: Request) {
  const identifier = getRateLimitIdentifier(null, request)
  const limit = checkRateLimit(identifier, 'contact', 5, 3_600_000)
  if (!limit.allowed) {
    return error('RATE_LIMITED', `Trop de messages envoyés. Réessayez dans ${limit.retryAfter} s.`, 429)
  }

  const parsed = await parseBody(request, ContactSchema)
  if (parsed instanceof Response) return parsed
  const { name, email, subject, message } = parsed.data

  const to = process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM || 'support@nkamva.com'

  await sendEmail({
    to,
    subject: `[Contact] ${SUBJECTS[subject]} — ${name}`,
    html: `<p><b>De :</b> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p><p><b>Sujet :</b> ${SUBJECTS[subject]}</p><hr><p style="white-space:pre-line">${escapeHtml(message)}</p>`,
    text: `De : ${name} <${email}>\nSujet : ${SUBJECTS[subject]}\n\n${message}`,
    tags: ['contact'],
  })

  // Le contenu du message n'est pas journalisé : seule la trace de l'envoi
  // l'est, pour pouvoir constater un abus sans conserver de données inutiles.
  await auditStandalone({
    actorRole: 'SYSTEM',
    action: 'CONTACT_MESSAGE_SENT',
    meta: { subject, from: email },
  })

  return success({ sent: true }, {}, 201)
}
