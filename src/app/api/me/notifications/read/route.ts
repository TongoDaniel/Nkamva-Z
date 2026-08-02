// Marquage des notifications comme lues — une seule, ou toutes sans `id`.
import { success, requireAuth } from '@/lib/api'
import { markNotificationsRead } from '@/lib/notification'

export async function POST(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  // Le bouton « tout marquer » n'envoie pas de corps : un JSON absent ou
  // illisible vaut « toutes », il n'y a rien à refuser ici.
  let id: string | undefined
  try {
    const body = await request.json()
    if (body && typeof body.id === 'string') id = body.id
  } catch {
    id = undefined
  }

  const count = await markNotificationsRead(ctx.user.id, id)
  return success({ count })
}
