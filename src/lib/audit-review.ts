// ==========================================================================
// Lecture du journal d'audit — décision 7
// ==========================================================================
// « Le journal d'audit est lisible par le Super-admin uniquement, mais toutes
// les actions des 3 rôles y sont écrites. » L'écriture existe depuis le Lot 0
// (`audit()` dans la transaction métier) ; c'est la lecture qui manquait.
//
// Ce module ne fait que lire. Aucune fonction n'écrit, ne modifie ni ne purge :
// un journal qu'on peut retoucher ne prouve rien.
// ==========================================================================

import { db } from './db'
import { AUDIT_ACTION_GROUPS } from './audit-labels'

// Les familles vivent avec les libellés : un onglet et le nom de son domaine
// sont la même décision. Ré-exporté pour les appelants historiques.
export { AUDIT_ACTION_GROUPS } from './audit-labels'

export interface AuditLogFilters {
  action?: string
  actorId?: string
  targetType?: string
  targetId?: string
  /** Recherche libre sur l'action, pour retrouver une famille d'événements. */
  search?: string
  page?: number
  pageSize?: number
}

function groupWhere(group: string) {
  const found = AUDIT_ACTION_GROUPS.find(g => g.value === group)
  if (!found || found.prefixes.length === 0) return {}
  return { OR: found.prefixes.map(prefix => ({ action: { startsWith: prefix } })) }
}

export async function listAuditLogs(filters: AuditLogFilters & { group?: string } = {}) {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(filters.pageSize ?? 30, 50)

  const where = {
    ...groupWhere(filters.group ?? 'all'),
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
    ...(filters.targetType ? { targetType: filters.targetType } : {}),
    ...(filters.targetId ? { targetId: filters.targetId } : {}),
    ...(filters.search
      ? { action: { contains: filters.search.toUpperCase().replace(/\s+/g, '_') } }
      : {}),
  }

  const [items, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.auditLog.count({ where }),
  ])

  // Les acteurs sont résolus en une seule requête : le journal peut être long,
  // et une jointure par ligne le rendrait illisible en base comme à l'écran.
  const actorIds = [...new Set(items.map(i => i.actorId).filter((id): id is string => Boolean(id)))]
  const actors = actorIds.length
    ? await db.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, email: true, fullName: true, role: true, adminRole: true },
      })
    : []
  const actorById = new Map(actors.map(a => [a.id, a]))

  return {
    items: items.map(item => ({ ...item, actor: item.actorId ? actorById.get(item.actorId) ?? null : null })),
    total,
    page,
    pageSize,
  }
}

export async function getAuditStats() {
  const dayAgo = new Date(Date.now() - 86_400_000)
  const [total, last24h, actors, actions] = await Promise.all([
    db.auditLog.count(),
    db.auditLog.count({ where: { createdAt: { gte: dayAgo } } }),
    db.auditLog.findMany({
      where: { actorId: { not: null } },
      distinct: ['actorId'],
      select: { actorId: true },
    }),
    db.auditLog.findMany({ distinct: ['action'], select: { action: true } }),
  ])

  return { total, last24h, distinctActors: actors.length, distinctActions: actions.length }
}

/** Actions distinctes réellement présentes, pour alimenter un filtre honnête. */
export async function listAuditActions(): Promise<string[]> {
  const rows = await db.auditLog.findMany({
    distinct: ['action'],
    select: { action: true },
    orderBy: { action: 'asc' },
  })
  return rows.map(r => r.action)
}
