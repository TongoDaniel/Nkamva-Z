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

import type { Prisma } from '@prisma/client'
import { db } from './db'
import { AUDIT_ACTION_GROUPS, AUDIT_ACTION_LABELS } from './audit-labels'

// Les familles vivent avec les libellés : un onglet et le nom de son domaine
// sont la même décision. Ré-exporté pour les appelants historiques.
export { AUDIT_ACTION_GROUPS } from './audit-labels'

/**
 * Acteur sans identifiant : les tâches planifiées et les webhooks. Ils sont de
 * loin les plus nombreux, et les écarter est la première chose qu'on veut faire
 * en cherchant ce qu'une **personne** a fait.
 */
export const ACTOR_SYSTEM = 'systeme'
/** L'inverse : uniquement ce qui a un acteur identifié. */
export const ACTOR_HUMAN = 'humains'

export interface AuditLogFilters {
  action?: string
  /** Un identifiant d'utilisateur, ou `ACTOR_SYSTEM` / `ACTOR_HUMAN`. */
  actorId?: string
  targetType?: string
  targetId?: string
  /**
   * Recherche libre. Elle couvre quatre choses, parce qu'on ne sait pas
   * d'avance laquelle on a sous la main : le code de l'action, son libellé
   * français (celui que l'écran affiche), l'identifiant de l'objet, et
   * l'acteur par son nom ou son email.
   */
  search?: string
  /** Bornes sur `createdAt`, incluses. */
  from?: Date
  to?: Date
  page?: number
  pageSize?: number
}

function groupWhere(group: string): Prisma.AuditLogWhereInput | null {
  const found = AUDIT_ACTION_GROUPS.find(g => g.value === group)
  if (!found || found.prefixes.length === 0) return null
  return { OR: found.prefixes.map(prefix => ({ action: { startsWith: prefix } })) }
}

/**
 * Traduit un terme libre en conditions. La recherche part du vocabulaire de
 * l'écran, pas de celui de la base : quelqu'un qui a lu « Tâche planifiée
 * terminée » tapera ces mots-là, jamais `SCHEDULED_JOB_COMPLETED`.
 */
async function searchWhere(term: string): Promise<Prisma.AuditLogWhereInput | null> {
  const needle = term.trim()
  if (!needle) return null

  const or: Prisma.AuditLogWhereInput[] = [
    // « moyen de paiement » → `MOYEN_DE_PAIEMENT` : la même saisie sert les deux
    // formes, on ne demande pas à l'utilisateur de connaître la convention.
    { action: { contains: needle.toUpperCase().replace(/\s+/g, '_') } },
    { targetId: { contains: needle, mode: 'insensitive' } },
  ]

  const byLabel = Object.entries(AUDIT_ACTION_LABELS)
    .filter(([, label]) => label.toLowerCase().includes(needle.toLowerCase()))
    .map(([action]) => action)
  if (byLabel.length) or.push({ action: { in: byLabel } })

  // Deux requêtes valent mieux qu'une jointure ici : `AuditLog.actorId` n'a pas
  // de relation déclarée vers `User` — l'acteur peut avoir été supprimé, et le
  // journal doit lui survivre.
  const actors = await db.user.findMany({
    where: {
      OR: [
        { email: { contains: needle, mode: 'insensitive' } },
        { fullName: { contains: needle, mode: 'insensitive' } },
        { preferredName: { contains: needle, mode: 'insensitive' } },
      ],
    },
    select: { id: true },
    take: 100,
  })
  if (actors.length) or.push({ actorId: { in: actors.map(a => a.id) } })

  return { OR: or }
}

export async function listAuditLogs(filters: AuditLogFilters & { group?: string } = {}) {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(filters.pageSize ?? 30, 50)

  // Un `AND` et non un objet étalé : la version précédente écrasait `action`
  // dès que `search` était fourni en même temps qu'un type d'action, et le
  // filtre le plus précis des deux disparaissait sans rien dire.
  const clauses: Prisma.AuditLogWhereInput[] = []
  const group = groupWhere(filters.group ?? 'all')
  if (group) clauses.push(group)
  if (filters.action) clauses.push({ action: filters.action })
  if (filters.actorId === ACTOR_SYSTEM) clauses.push({ actorId: null })
  else if (filters.actorId === ACTOR_HUMAN) clauses.push({ actorId: { not: null } })
  else if (filters.actorId) clauses.push({ actorId: filters.actorId })
  if (filters.targetType) clauses.push({ targetType: filters.targetType })
  if (filters.targetId) clauses.push({ targetId: filters.targetId })
  if (filters.from || filters.to) {
    clauses.push({
      createdAt: {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      },
    })
  }
  const search = filters.search ? await searchWhere(filters.search) : null
  if (search) clauses.push(search)

  const where: Prisma.AuditLogWhereInput = clauses.length ? { AND: clauses } : {}

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

/**
 * Actions distinctes réellement présentes, pour alimenter un filtre honnête.
 *
 * Honnête au sens strict : lister les 69 actions que le code sait écrire
 * proposerait des filtres qui ne ramènent rien. On ne propose que ce qui existe
 * en base.
 */
export async function listAuditActions(): Promise<string[]> {
  const rows = await db.auditLog.findMany({
    distinct: ['action'],
    select: { action: true },
    orderBy: { action: 'asc' },
  })
  return rows.map(r => r.action)
}

export interface AuditActor {
  id: string
  label: string
  /** Sous-rôle admin, ou rôle, pour distinguer deux homonymes. */
  role: string | null
  entries: number
}

/**
 * Acteurs identifiés apparaissant au journal, les plus actifs d'abord, avec leur
 * nombre d'entrées.
 *
 * Un acteur supprimé depuis reste dans le journal — il est alors rendu par son
 * identifiant, pas écarté de la liste : le faire disparaître du filtre
 * rendrait ses actions introuvables, ce qui est exactement ce qu'un journal
 * d'audit ne doit jamais permettre.
 */
export async function listAuditActors(): Promise<AuditActor[]> {
  const grouped = await db.auditLog.groupBy({
    by: ['actorId'],
    where: { actorId: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { actorId: 'desc' } },
    take: 100,
  })

  const ids = grouped.map(g => g.actorId).filter((id): id is string => Boolean(id))
  if (ids.length === 0) return []

  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, email: true, fullName: true, preferredName: true, role: true, adminRole: true },
  })
  const byId = new Map(users.map(u => [u.id, u]))

  return grouped.flatMap(row => {
    const id = row.actorId
    if (!id) return []
    const user = byId.get(id)
    return [{
      id,
      label: user
        ? user.fullName || user.preferredName || user.email
        : `Compte supprimé · ${id.slice(0, 8)}…`,
      role: user ? user.adminRole ?? user.role : null,
      entries: row._count._all,
    }]
  })
}
