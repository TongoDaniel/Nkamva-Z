// ==========================================================================
// Lot 1 — Modèles de lecture de la console de validation des formateurs
// ==========================================================================
// Ce fichier ne contient QUE des lectures : le listing, les compteurs et le
// détail que les pages `/admin/validation-formateurs` affichent. Les jointures
// et les projections y sont taillées pour l'écran, pas pour l'API.
//
// L'instruction — T3, T4, T6/T7, T8 — vit dans `trainer-applications.ts` et
// n'est atteinte que par les routes `/api/admin/trainer-applications/*`, que la
// console appelle en POST. Ce module en avait une seconde implémentation, morte
// depuis toujours : aucune route ni page ne l'appelait, et elle divergeait du
// chemin réel sur deux points (pas d'ouverture de la première période
// d'abonnement, effets de bord hors `deliverSideEffects`). Supprimée le 3 août
// 2026. Toute écriture ajoutée ici recréerait la même ambiguïté.
// ==========================================================================

import type { TrainerApplicationStatus } from '@prisma/client'
import { db } from './db'

// --- Listing et statistiques ---

export interface ListFilters {
  status?: TrainerApplicationStatus
  search?: string
  page: number
  pageSize: number
}

export async function listApplications(filters: ListFilters) {
  const where = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.search
      ? {
          user: {
            OR: [
              { email: { contains: filters.search, mode: 'insensitive' as const } },
              { fullName: { contains: filters.search, mode: 'insensitive' as const } },
            ],
          },
        }
      : {}),
  }

  const [items, total] = await Promise.all([
    db.trainerApplication.findMany({
      where,
      select: {
        id: true, status: true, slogan: true, domains: true, experienceYears: true,
        submittedAt: true, reviewedAt: true, approvedAt: true, rejectedAt: true,
        createdAt: true, updatedAt: true,
        user: { select: { id: true, email: true, fullName: true, countryCode: true } },
        documents: { where: { isCurrent: true }, select: { type: true, status: true } },
      },
      // Les dossiers soumis les plus anciens d'abord : on traite dans l'ordre
      // d'arrivée, pas dans l'ordre inverse.
      orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    db.trainerApplication.count({ where }),
  ])

  return { items, total, page: filters.page, pageSize: filters.pageSize }
}

export async function getApplicationStats() {
  const rows = await db.trainerApplication.groupBy({ by: ['status'], _count: { _all: true } })
  const count = (status: TrainerApplicationStatus) =>
    rows.find((r) => r.status === status)?._count._all ?? 0

  return {
    submitted: count('SUBMITTED'),
    resubmissionPending: count('RESUBMISSION_PENDING'),
    approved: count('APPROVED'),
    rejected: count('REJECTED'),
    draft: count('DRAFT'),
    total: rows.reduce((sum, r) => sum + r._count._all, 0),
  }
}

export async function getApplicationDetail(applicationId: string) {
  return db.trainerApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true, status: true, slogan: true, description: true, websiteUrl: true,
      domains: true, experienceYears: true, submittedAt: true, reviewedAt: true,
      finalRejectionReason: true, approvedAt: true, rejectedAt: true,
      reopenedAt: true, reopenedById: true, createdAt: true, updatedAt: true,
      // La cadence demandée décide du montant que l'acceptation rendra exigible :
      // l'écran d'examen l'annonce au modérateur avant qu'il tranche.
      desiredCadence: true,
      user: {
        select: { id: true, email: true, fullName: true, countryCode: true, phone: true, createdAt: true },
      },
      documents: {
        where: { isCurrent: true },
        select: {
          id: true, type: true, status: true, rejectionReason: true, resubmissionCount: true,
          originalFileName: true, sizeBytes: true, mimeType: true, purgedAt: true, createdAt: true,
        },
        orderBy: { type: 'asc' },
      },
      reviewEvents: {
        select: { fromStatus: true, toStatus: true, reason: true, rejectedDocIds: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
}
