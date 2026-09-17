// ==========================================================================
// Lecture de l'annuaire des comptes — décision 7
// ==========================================================================
// « Finances : lecture seule sur les utilisateurs. » Ce module n'expose que de
// la lecture, pour tout le monde : les actions de suspension et de changement
// de rôle n'ont ni route ni arbitrage, et les inventer ici les rendrait
// possibles sans qu'elles aient été décidées.
//
// Aucun secret n'en sort : ni `passwordHash`, ni `googleSub`, ni les clés S3
// d'export RGPD. Le select est explicite pour cette raison.
// ==========================================================================

import { db } from './db'
import type { Role } from '@prisma/client'

const USER_SELECT = {
  id: true, email: true, fullName: true, preferredName: true, phone: true, countryCode: true,
  // Les colonnes de photo : l'écran des comptes n'affichait que des initiales,
  // là où reconnaître un visage aide à instruire un signalement.
  avatarS3Key: true, avatarUrl: true,
  role: true, adminRole: true, emailVerifiedAt: true,
  suspendedAt: true, suspendedReason: true,
  deletionRequestedAt: true, deletedAt: true,
  createdAt: true,
  sanctionLevel: true,
  sanctionReason: true,
  trainerProfile: { select: { id: true, approvedAt: true, suspendedAt: true } },
} as const

export interface UserFilters {
  role?: Role
  /** `true` : uniquement les comptes suspendus. */
  suspended?: boolean
  search?: string
  page?: number
  pageSize?: number
}

export async function listUsers(filters: UserFilters = {}) {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(filters.pageSize ?? 20, 50)

  const where = {
    // Un compte supprimé reste en base (soft delete, convention Lot 0) mais ne
    // figure pas dans l'annuaire courant.
    deletedAt: null,
    ...(filters.role ? { role: filters.role } : {}),
    ...(filters.suspended === true ? { suspendedAt: { not: null } } : {}),
    ...(filters.search
      ? {
          OR: [
            { email: { contains: filters.search, mode: 'insensitive' as const } },
            { fullName: { contains: filters.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [items, total] = await Promise.all([
    db.user.findMany({
      where,
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.user.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function getUserStats() {
  const [byRole, suspended, pendingDeletion] = await Promise.all([
    db.user.groupBy({ by: ['role'], where: { deletedAt: null }, _count: { _all: true } }),
    db.user.count({ where: { deletedAt: null, suspendedAt: { not: null } } }),
    db.user.count({ where: { deletedAt: null, deletionRequestedAt: { not: null } } }),
  ])

  const counts = Object.fromEntries(byRole.map(r => [r.role, r._count._all]))
  return {
    learners: counts.LEARNER ?? 0,
    trainers: counts.TRAINER ?? 0,
    admins: counts.ADMIN ?? 0,
    suspended,
    pendingDeletion,
  }
}
