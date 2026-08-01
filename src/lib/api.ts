import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from './auth'
import type { Role, AdminRole } from '@prisma/client'

export interface AuthContext { user: { id: string; email: string; role: Role; adminRole: AdminRole | null; trainerId: string | null } }

export function success<T>(data: T, meta?: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json({ data, ...(meta ? { meta } : {}) }, { status })
}

export function error(code: string, message: string, status: number, details?: Array<{ field?: string; reason?: string }>): NextResponse {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status })
}

const PUBLIC_ROUTES: { method: string; prefix: string }[] = [
  { method: 'POST', prefix: '/api/auth/register' },
  { method: 'POST', prefix: '/api/auth/otp' },
  { method: 'POST', prefix: '/api/auth/verify-otp' },
  { method: 'POST', prefix: '/api/auth/reset-password' },
  { method: 'GET', prefix: '/api/catalog/' },
  { method: 'GET', prefix: '/api/courses/' },
  { method: 'GET', prefix: '/api/trainers' },
  { method: 'GET', prefix: '/api/communities' },
  { method: 'GET', prefix: '/api/tarifs' },
  { method: 'GET', prefix: '/api/legal/' },
  { method: 'GET', prefix: '/api/contact' },
  { method: 'POST', prefix: '/api/contact' },
  { method: 'GET', prefix: '/api/aide' },
  { method: 'POST', prefix: '/api/webhooks/' },
  { method: 'GET', prefix: '/api/health' },
]

export function isPublicRoute(method: string, path: string): boolean {
  return PUBLIC_ROUTES.some(r => method === r.method && (path === r.prefix || path.startsWith(r.prefix)))
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null
  return { user: { id: session.user.id, email: session.user.email || '', role: session.user.role, adminRole: session.user.adminRole, trainerId: session.user.trainerId } }
}

export async function requireAuth(): Promise<AuthContext | NextResponse> {
  const ctx = await getAuthContext()
  if (!ctx) return error('UNAUTHORIZED', 'Non authentifié', 401)
  return ctx
}

export async function requireRole(...roles: Role[]): Promise<AuthContext | NextResponse> {
  const ctx = await requireAuth()
  if (ctx instanceof NextResponse) return ctx
  if (!roles.includes(ctx.user.role)) return error('FORBIDDEN_ROLE', 'Rôle insuffisant', 403)
  return ctx
}

export async function requireAdminSubRole(...subRoles: AdminRole[]): Promise<AuthContext | NextResponse> {
  const ctx = await requireAuth()
  if (ctx instanceof NextResponse) return ctx
  if (ctx.user.role !== 'ADMIN' || !ctx.user.adminRole || !subRoles.includes(ctx.user.adminRole)) {
    const labels = subRoles.join(' ou ')
    return error('FORBIDDEN_SUBROLE', `Accès réservé au sous-rôle ${labels}`, 403)
  }
  return ctx
}

export async function requireTrainer(): Promise<AuthContext | NextResponse> {
  const ctx = await requireAuth()
  if (ctx instanceof NextResponse) return ctx
  if (!ctx.user.trainerId) return error('NOT_TRAINER', 'Compte formateur requis', 403)
  return ctx
}

export function checkStale(expectedUpdatedAt: string, actualUpdatedAt: Date): boolean {
  return new Date(expectedUpdatedAt).getTime() !== actualUpdatedAt.getTime()
}

// Mapping mutualisé des erreurs métier levées par les services (`throw new
// Error('CODE')`) vers l'enveloppe HTTP. Les routes n'ont plus qu'à relayer.
const DOMAIN_ERRORS: Record<string, { message: string; status: number }> = {
  // Communs
  NOT_OWNER: { message: 'Ressource non possédée', status: 403 },
  // Lot 2 — litiges
  PURCHASE_NOT_FOUND: { message: 'Achat introuvable', status: 404 },
  PURCHASE_NOT_SUCCEEDED: { message: 'Achat non confirmé', status: 422 },
  ALREADY_REFUNDED: { message: 'Achat déjà remboursé', status: 409 },
  DISPUTE_NOT_FOUND: { message: 'Litige introuvable', status: 404 },
  DISPUTE_ALREADY_ACTIVE: { message: 'Un litige est déjà en cours sur cet achat', status: 409 },
  DISPUTE_ALREADY_RESOLVED: { message: 'Litige déjà résolu', status: 409 },
  DISPUTE_CLOSED: { message: 'Litige clos', status: 409 },
  DISPUTE_WINDOW_EXPIRED: { message: 'Le délai de 14 jours est dépassé', status: 422 },
  RESOURCE_CONSUMED: { message: 'Ressource consultée à plus de 30 %', status: 422 },
  RESOURCE_DOWNLOADED: { message: 'Ressource déjà téléchargée', status: 403 },
  STALE_DISPUTE: { message: 'Le litige a été modifié entre-temps', status: 409 },
  INVALID_STATUS: { message: 'Transition impossible depuis ce statut', status: 409 },
  INVALID_RESOLUTION: { message: 'Résolution invalide', status: 400 },
  INVALID_REFUND_AMOUNT: { message: 'Montant de remboursement invalide', status: 400 },
  MESSAGE_TOO_LONG: { message: 'Message trop long', status: 400 },
  PROVIDER_DISPUTE_ACTIVE: { message: 'Un chargeback provider est en cours sur cet achat', status: 409 },
  OVERRIDE_FORBIDDEN: { message: 'Bypass réservé au Super-admin', status: 403 },
  OVERRIDE_JUSTIFICATION_REQUIRED: { message: 'Justification obligatoire pour un bypass', status: 400 },
  REFUND_RULE_NOT_MET: { message: 'La règle 14 jours / 30 % n\'est pas satisfaite', status: 422 },
  CONTEST_ALREADY_OPEN: { message: 'Une contestation est déjà ouverte', status: 409 },
  ATTACHMENT_INVALID: { message: 'Pièce jointe invalide ou expirée', status: 400 },
  MIME_NOT_ALLOWED: { message: 'Type MIME non autorisé', status: 400 },
  SIZE_EXCEEDS_LIMIT: { message: 'Taille dépassée', status: 400 },
  TASK_NOT_FOUND: { message: 'Tâche introuvable', status: 404 },
  TASK_NOT_PENDING: { message: 'Tâche déjà traitée', status: 409 },
}

export function errorFromException(err: unknown): NextResponse {
  const code = err instanceof Error ? err.message : ''
  const known = DOMAIN_ERRORS[code]
  if (known) return error(code, known.message, known.status)
  console.error('[API:UNEXPECTED_ERROR]', err)
  return error('INTERNAL_ERROR', 'Erreur interne', 500)
}

export function parsePagination(url: URL): { page: number; pageSize: number } {
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || 20))
  return { page, pageSize }
}

export async function parseBody<T>(request: Request, schema: { parse: (data: unknown) => T }): Promise<{ data: T } | NextResponse> {
  try {
    const json = await request.json()
    return { data: schema.parse(json) }
  } catch (err: any) {
    if (err.issues) return error('VALIDATION_ERROR', 'Requête invalide', 400, err.issues.map((i: any) => ({ field: i.path.join('.'), reason: i.message })))
    return error('INVALID_JSON', 'Corps de requête invalide', 400)
  }
}
