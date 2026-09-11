const hits = new Map<string, number[]>()
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, timestamps] of hits) {
      const filtered = timestamps.filter(t => now - t < 60 * 60 * 1000)
      if (filtered.length === 0) hits.delete(key); else hits.set(key, filtered)
    }
  }, 5 * 60 * 1000).unref?.()
}

export interface RateLimitResult { allowed: boolean; retryAfter: number | null; remaining: number }

/**
 * Consulte le compteur sans le consommer. Sert aux plafonds qui ne doivent
 * compter que les échecs — la connexion notamment : compter chaque tentative
 * verrouillerait un utilisateur légitime qui se connecte six fois en une minute
 * (deux onglets, un mot de passe recollé, un retour arrière).
 */
export function peekRateLimit(identifier: string, action: string, max: number, windowMs: number): RateLimitResult {
  const key = `${action}:${identifier}`
  const now = Date.now()
  const timestamps = (hits.get(key) ?? []).filter(t => now - t < windowMs)
  if (timestamps.length >= max) { const retryAfter = Math.ceil((timestamps[0] + windowMs - now) / 1000); return { allowed: false, retryAfter, remaining: 0 } }
  return { allowed: true, retryAfter: null, remaining: max - timestamps.length }
}

/** Consomme une unité du compteur, sans se prononcer sur le plafond. */
export function recordRateLimitHit(identifier: string, action: string, windowMs: number): void {
  const key = `${action}:${identifier}`
  const now = Date.now()
  const timestamps = (hits.get(key) ?? []).filter(t => now - t < windowMs)
  timestamps.push(now)
  hits.set(key, timestamps)
}

/** Remet le compteur à zéro — une réussite efface les échecs qui la précèdent. */
export function clearRateLimit(identifier: string, action: string): void {
  hits.delete(`${action}:${identifier}`)
}

export function checkRateLimit(identifier: string, action: string, max: number, windowMs: number): RateLimitResult {
  const result = peekRateLimit(identifier, action, max, windowMs)
  if (!result.allowed) return result
  recordRateLimitHit(identifier, action, windowMs)
  return { ...result, remaining: result.remaining - 1 }
}

function firstForwardedFor(value: string | null | undefined): string | null {
  return value?.split(',')[0]?.trim() || null
}

export function getRateLimitIdentifier(user: { id?: string } | null, request: Request): string {
  if (user?.id) return user.id
  return firstForwardedFor(request.headers.get('x-forwarded-for')) || request.headers.get('x-real-ip') || 'anonymous'
}

/**
 * NextAuth ne passe pas un `Request` à `authorize()` mais un objet interne dont
 * les en-têtes sont un dictionnaire simple : `getRateLimitIdentifier` ne sait
 * pas le lire.
 */
export function ipFromHeaderRecord(headers: Record<string, unknown> | undefined): string {
  const get = (name: string) => {
    const raw = headers?.[name]
    return typeof raw === 'string' ? raw : Array.isArray(raw) ? String(raw[0]) : null
  }
  return firstForwardedFor(get('x-forwarded-for')) || get('x-real-ip') || 'anonymous'
}

export const RATE_LIMITS = {
  LOGIN: { max: 5, windowMs: 60_000 },
  REGISTER: { max: 5, windowMs: 60_000 },
  OTP_REQUEST: { max: 3, windowMs: 3_600_000 },
  OTP_VERIFY: { max: 5, windowMs: 15_000 },
  DISPUTE_OPEN: { max: 3, windowMs: 3_600_000 },
  DISPUTE_MESSAGE: { max: 30, windowMs: 3_600_000 },
  UPLOAD_PRESIGN: { max: 10, windowMs: 60_000 },
  // Chaque initiation crée un PaymentIntent chez Stripe ou une session CinetPay :
  // c'est un appel facturé et compté par le fournisseur, pas une simple écriture.
  PURCHASE_INITIATE: { max: 10, windowMs: 600_000 },
  PAYOUT_METHOD_CREATE: { max: 3, windowMs: 86_400_000 },
  PAYOUT_CREATE: { max: 3, windowMs: 86_400_000 },
  MICRO_DEPOSIT_CONFIRM: { max: 3, windowMs: 86_400_000 },
  // Un signalement coûte du temps de modération : sans plafond, un seul compte
  // sature la file.
  REPORT_CREATE: { max: 10, windowMs: 3_600_000 },
  // Recherche à la frappe : le plafond compte des requêtes amorties à 300 ms,
  // donc au pire une poignée par seconde de saisie. 120 par minute laisse
  // écrire deux ou trois termes complets d'affilée sans jamais s'en approcher.
  //
  // Il est volontairement généreux : sans session, le compteur porte sur
  // l'adresse IP, et deux personnes derrière le même accès le partagent. Un
  // plafond serré ne protégerait rien de précieux — la route ne rend que ce que
  // la page publique affiche déjà — et couperait une recherche normale au
  // milieu d'un mot, sans message.
  COMMUNITY_SEARCH: { max: 120, windowMs: 60_000 },
} as const
