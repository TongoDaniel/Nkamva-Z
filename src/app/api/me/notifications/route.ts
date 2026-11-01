import { success, requireAuth } from '@/lib/api'
import { countUnreadNotifications, listMyNotifications } from '@/lib/notification'

/**
 * Les notifications de l'utilisateur, pour l'application mobile. Le site les
 * lit côté serveur dans `(app)/notifications/page.tsx` ; même service, même
 * champs, même plafond.
 */
export async function GET() {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const [rows, unread] = await Promise.all([
    listMyNotifications(ctx.user.id),
    countUnreadNotifications(ctx.user.id),
  ])
  return success(
    rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
    { unread },
  )
}
