// Export RGPD : copie des données personnelles, servie en JSON téléchargeable
import { error, requireAuth } from '@/lib/api'
import { buildGdprExport } from '@/lib/profile'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  // Un export agrège plusieurs tables : on borne la fréquence des demandes.
  const identifier = getRateLimitIdentifier({ id: ctx.user.id }, request)
  const limit = checkRateLimit(identifier, 'gdpr-export', RATE_LIMITS.OTP_REQUEST.max, RATE_LIMITS.OTP_REQUEST.windowMs)
  if (!limit.allowed) {
    return error('RATE_LIMITED', `Trop de demandes d'export. Réessayez dans ${limit.retryAfter} s.`, 429)
  }

  const data = await buildGdprExport(ctx.user.id)
  if (!data) return error('USER_NOT_FOUND', 'Compte introuvable', 404)

  const date = new Date().toISOString().slice(0, 10)
  // Réponse brute et non enveloppée : le corps est le fichier lui-même.
  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="nkamva-donnees-${date}.json"`,
      // Données personnelles : jamais mises en cache par un intermédiaire.
      'cache-control': 'no-store, private',
    },
  })
}
