// Lot 0 — Health check (route publique, sans authentification)
import { success, error } from '@/lib/api'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`
    return success({ status: 'ok', database: 'up', time: new Date().toISOString() })
  } catch {
    return error('DATABASE_UNAVAILABLE', 'Base de données injoignable', 503)
  }
}
