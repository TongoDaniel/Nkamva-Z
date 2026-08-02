import { db } from './db'
import { auditStandalone } from './audit'

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
