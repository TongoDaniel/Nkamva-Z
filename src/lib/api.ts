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
  return { user: { id: session.user.id, email: session.user.email || '', role: (session.user as any).role as Role, adminRole: (session.user as any).adminRole as AdminRole | null, trainerId: (session.user as any).trainerId as string | null } }
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

export const MAX_PAGE_SIZE = 50

/**
 * Pagination normalisée : `page >= 1`, `pageSize` borné à MAX_PAGE_SIZE.
 * Sans ce garde-fou, `?pageSize=100000` faisait charger toute la table.
 */
export function parsePagination(searchParams: URLSearchParams, defaultPageSize = 20): { page: number; pageSize: number } {
  const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1)
  const raw = Number.parseInt(searchParams.get('pageSize') || String(defaultPageSize), 10)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.isFinite(raw) ? raw : defaultPageSize))
  return { page, pageSize }
}

export function checkStale(expectedUpdatedAt: string, actualUpdatedAt: Date): boolean {
  return new Date(expectedUpdatedAt).getTime() !== actualUpdatedAt.getTime()
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
