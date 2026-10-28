import { checkRateLimit, getRateLimitIdentifier } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * Rapports de violation de la CSP (en-tête posé dans `next.config.ts`).
 *
 * Le navigateur les poste lui-même, sans session : la route est donc publique,
 * et tout ce qu'elle reçoit est une saisie anonyme. Elle n'écrit rien en base —
 * une ligne de journal par violation, pas plus — et elle borne la taille du
 * corps et le débit par adresse, pour qu'un tiers ne puisse pas s'en servir
 * pour remplir les journaux.
 *
 * Deux formats coexistent : l'ancien `report-uri` (`{ "csp-report": {…} }`,
 * `application/csp-report`) et l'API Reporting (`[{ type, body }]`,
 * `application/reports+json`).
 */
const MAX_BODY_BYTES = 16 * 1024
const MAX_REPORTS_PER_MINUTE = 30

interface Violation {
  directive: string
  blocked: string
  page: string
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 300) : ''
}

function readViolations(payload: unknown): Violation[] {
  const entries = Array.isArray(payload)
    ? payload.map((entry) => (entry as { body?: unknown })?.body)
    : [(payload as { 'csp-report'?: unknown })?.['csp-report']]
  return entries.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return []
    const r = raw as Record<string, unknown>
    return [{
      directive: text(r['effective-directive'] ?? r.effectiveDirective ?? r['violated-directive']),
      blocked: text(r['blocked-uri'] ?? r.blockedURL),
      page: text(r['document-uri'] ?? r.documentURL),
    }]
  })
}

export async function POST(request: Request) {
  const limit = checkRateLimit(getRateLimitIdentifier(null, request), 'csp-report', MAX_REPORTS_PER_MINUTE, 60_000)
  if (!limit.allowed) return new Response(null, { status: 429 })

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return new Response(null, { status: 413 })

  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return new Response(null, { status: 400 })
  }

  for (const v of readViolations(payload)) {
    console.warn(`[csp] ${v.directive || '?'} a bloqué ${v.blocked || '?'} sur ${v.page || '?'}`)
  }
  return new Response(null, { status: 204 })
}
