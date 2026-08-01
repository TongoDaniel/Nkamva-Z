import { db } from '@/lib/db'
import { success, error } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`
    return success({ status: 'ok', database: 'up', timestamp: new Date().toISOString() })
  } catch {
    return error('DATABASE_UNAVAILABLE', 'Base de données injoignable', 503)
  }
}
