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

export async function notifyAdminSubRole(subRole: string, params: NotifyParams): Promise<void> {
  const admins = await db.user.findMany({ where: { role: 'ADMIN', adminRole: subRole as any, deletedAt: null, suspendedAt: null }, select: { id: true } })
  if (admins.length === 0) return
  await db.notification.createMany({ data: admins.map(a => ({ userId: a.id, type: params.type, title: params.title, body: params.body, link: params.link ?? null })) })
}
