import { db } from '@/lib/db'
import { success, error } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`
    // Réponse volontairement minimale : un visiteur anonyme n'a pas à savoir que
    // la base est jointe ni à lire l'horloge serveur. La sonde reste exacte —
    // 200 si la requête aboutit, 503 sinon — ce qui suffit à un moniteur.
    return success({ status: 'ok' })
  } catch {
    return error('DATABASE_UNAVAILABLE', 'Service indisponible', 503)
  }
}
