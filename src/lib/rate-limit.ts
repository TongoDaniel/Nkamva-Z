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

export function checkRateLimit(identifier: string, action: string, max: number, windowMs: number): RateLimitResult {
  const key = `${action}:${identifier}`
  const now = Date.now()
  const timestamps = (hits.get(key) ?? []).filter(t => now - t < windowMs)
  if (timestamps.length >= max) { const retryAfter = Math.ceil((timestamps[0] + windowMs - now) / 1000); return { allowed: false, retryAfter, remaining: 0 } }
  timestamps.push(now); hits.set(key, timestamps)
  return { allowed: true, retryAfter: null, remaining: max - timestamps.length }
}

export function getRateLimitIdentifier(user: { id?: string } | null, request: Request): string {
  if (user?.id) return user.id
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  return forwarded?.split(',')[0]?.trim() || realIp || 'anonymous'
}

export const RATE_LIMITS = {
  LOGIN: { max: 5, windowMs: 60_000 },
  REGISTER: { max: 5, windowMs: 60_000 },
  OTP_REQUEST: { max: 3, windowMs: 3_600_000 },
  OTP_VERIFY: { max: 5, windowMs: 15_000 },
  DISPUTE_OPEN: { max: 3, windowMs: 3_600_000 },
  DISPUTE_MESSAGE: { max: 30, windowMs: 3_600_000 },
  UPLOAD_PRESIGN: { max: 10, windowMs: 60_000 },
  PAYOUT_METHOD_CREATE: { max: 3, windowMs: 86_400_000 },
  PAYOUT_CREATE: { max: 3, windowMs: 86_400_000 },
  MICRO_DEPOSIT_CONFIRM: { max: 3, windowMs: 86_400_000 },
} as const
