import { db } from './db'
import { auditStandalone } from './audit'
import { sendEmail, renderSimpleEmail } from './email'

export interface NotifyParams { type: string; title: string; body: string; link?: string | null }

/**
 * Notifications et emails partent APRÈS le commit. Une panne Resend, un
 * destinataire invalide ou un rate limit provider ne doit jamais faire échouer
 * une transition d'état déjà persistée : sinon l'appelant reçoit un 500 alors
 * que l'objet existe, et son retry se heurte à un conflit.
 * L'échec est journalisé pour être rejoué ou investigué.
 */
export async function deliverSideEffects(
  label: string,
  target: { type: string; id: string },
  run: () => Promise<void>,
): Promise<void> {
  try {
    await run()
  } catch (err) {
    console.error('[NOTIFY:FAILED]', { label, target, error: String(err) })
    await auditStandalone({
      action: 'NOTIFICATION_DELIVERY_FAILED',
      targetType: target.type, targetId: target.id,
      meta: { label, error: String(err) },
    }).catch(() => { /* l'audit ne doit pas masquer l'erreur d'origine */ })
  }
}

// Base des liens d'email : un href relatif est mort dans un client mail.
export function absoluteUrl(path: string): string {
  const base = process.env.WEB_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
  return `${base.replace(/\/+$/, '')}${path}`
}

export async function notify(userId: string, params: NotifyParams): Promise<void> {
  await db.notification.create({ data: { userId, type: params.type, title: params.title, body: params.body, link: params.link ?? null } })
}

/**
 * Les préférences d'email que l'utilisateur peut éteindre lui-même.
 *
 * Le type est une union de **noms de colonnes de `User`** plutôt qu'une chaîne
 * libre : ajouter une préférence oblige à ajouter le champ, et une préférence
 * mal orthographiée ne se lit pas comme « désactivé » au moment de l'envoi.
 */
export type EmailPreference = 'subscriptionNoticeEmails' | 'relationalEmails'

/**
 * Un email **transactionnel**, que rien ne coupe (arbitrage 119).
 *
 * Reçu d'achat, accès qui s'ouvre, annonce de vente : ce sont des preuves, pas
 * des annonces. Les couper transformerait une préférence de confort en perte de
 * droits — quelqu'un qui ne retrouve pas son reçu n'a plus rien à opposer.
 *
 * Écrit comme une valeur nommée plutôt que `null` en clair à l'appel : à la
 * lecture, `TRANSACTIONAL` dit la règle, là où un `null` aurait laissé croire à
 * un oubli.
 */
export const TRANSACTIONAL = null

/** Comment couper l'envoi — dit dans l'email lui-même, pas ailleurs. */
const OPT_OUT_FOOTNOTES: Record<EmailPreference, string> = {
  subscriptionNoticeEmails:
    "Vous pouvez désactiver ces emails d'information depuis Profil & paramètres, onglet Profil. " +
    'Les messages liés à vos factures, impayés et litiges continueront de vous parvenir.',
  relationalEmails:
    'Vous pouvez désactiver ces emails depuis Profil & paramètres, onglet Profil. ' +
    "Vos reçus d'achat, vos factures et l'ouverture de vos accès continueront de vous parvenir.",
}

/**
 * Notification in-app **et** email d'accompagnement, l'email seul étant
 * soumis à la préférence de l'utilisateur.
 *
 * La notification part toujours : c'est la trace, consultable dans le compte, et
 * la couper reviendrait à laisser un formateur sans aucun moyen d'apprendre ce
 * qui touche son argent. L'email n'est que le porte-voix — celui-là se coupe.
 *
 * Un compte effacé ne reçoit rien : son adresse n'a plus à être sollicitée.
 */
export async function notifyWithEmail(
  userId: string,
  params: NotifyParams,
  email: { subject: string; title: string; paragraphs: string[]; cta?: { label: string; url: string } },
  preference: EmailPreference | typeof TRANSACTIONAL,
): Promise<void> {
  await notify(userId, params)

  const user = await db.user.findUnique({
    where: { id: userId },
    // Un email transactionnel ne consulte aucune préférence : la lire pour
    // l'ignorer laisserait croire qu'elle décide de quelque chose.
    select: { email: true, deletedAt: true, ...(preference ? { [preference]: true } : {}) },
  })
  if (!user || user.deletedAt || !user.email) return
  if (preference && !user[preference]) return

  await sendEmail({
    to: user.email,
    subject: email.subject,
    ...renderSimpleEmail({
      title: email.title,
      paragraphs: email.paragraphs,
      cta: email.cta,
      // Rien à proposer de couper quand rien ne se coupe.
      footnote: preference ? OPT_OUT_FOOTNOTES[preference] : undefined,
    }),
    tags: [params.type.toLowerCase().replace(/_/g, '-')],
  })
}

// --- Lecture côté destinataire ---

const NOTIFICATIONS_LIMIT = 50

/**
 * `notify()` écrit des notifications depuis les litiges, les paiements et la
 * validation des candidatures ; jusqu'ici rien ne les relisait. La liste est
 * plafonnée : au-delà de cinquante lignes, l'écran n'aide plus personne.
 */
export async function listMyNotifications(userId: string, limit = NOTIFICATIONS_LIMIT) {
  return db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } })
}

/**
 * Marque une notification, ou toutes si `id` est omis. Le `userId` est dans le
 * `where` et non vérifié après coup : un identifiant appartenant à quelqu'un
 * d'autre ne met simplement rien à jour.
 */
export async function markNotificationsRead(userId: string, id?: string): Promise<number> {
  const result = await db.notification.updateMany({
    where: { userId, readAt: null, ...(id ? { id } : {}) },
    data: { readAt: new Date() },
  })
  return result.count
}

export async function notifyAdminSubRole(subRole: string, params: NotifyParams): Promise<void> {
  const admins = await db.user.findMany({ where: { role: 'ADMIN', adminRole: subRole as any, deletedAt: null, suspendedAt: null }, select: { id: true } })
  if (admins.length === 0) return
  await db.notification.createMany({ data: admins.map(a => ({ userId: a.id, type: params.type, title: params.title, body: params.body, link: params.link ?? null })) })
}
