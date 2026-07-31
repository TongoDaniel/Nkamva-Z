import { db } from './db'

export interface NotifyParams { type: string; title: string; body: string; link?: string | null }

export async function notify(userId: string, params: NotifyParams): Promise<void> {
  await db.notification.create({ data: { userId, type: params.type, title: params.title, body: params.body, link: params.link ?? null } })
}

export async function notifyAdminSubRole(subRole: string, params: NotifyParams): Promise<void> {
  const admins = await db.user.findMany({ where: { role: 'ADMIN', adminRole: subRole as any, deletedAt: null, suspendedAt: null }, select: { id: true } })
  if (admins.length === 0) return
  await db.notification.createMany({ data: admins.map(a => ({ userId: a.id, type: params.type, title: params.title, body: params.body, link: params.link ?? null })) })
}
