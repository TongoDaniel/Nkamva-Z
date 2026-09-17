// ==========================================================================
// Lot 2 — Modèles de lecture de la console d'arbitrage des litiges
// ==========================================================================
// Ce fichier ne contient QUE des lectures : le listing, les compteurs, le
// détail d'un litige et la file des remboursements manuels, projetés pour les
// pages `/admin/litiges` et `/admin/remboursements`.
//
// L'arbitrage — prise en charge, question à l'apprenant, résolution, mouvements
// de fonds — vit dans `disputes.ts`, et les tâches manuelles dans
// `manual-refund-tasks.ts` ; ce sont eux que les routes `/api/admin/disputes/*`
// appellent. Ce module en avait une seconde implémentation complète, morte
// depuis toujours : aucune route ne l'atteignait. Supprimée le 3 août 2026, en
// même temps que son équivalent du Lot 1. Toute écriture ajoutée ici recréerait
// la même ambiguïté.
// ==========================================================================

import type { DisputeStatus } from '@prisma/client'
import { db } from './db'

// --- Listing ---

export async function listDisputes(filters: {
  status?: DisputeStatus
  page: number
  pageSize: number
}) {
  const where = filters.status ? { status: filters.status } : {}
  const [items, total] = await Promise.all([
    db.dispute.findMany({
      where,
      select: {
        id: true, status: true, reason: true, source: true, disputedAmountFcfa: true,
        openedAt: true, lastActivityAt: true, learnerDeadlineAt: true, resolution: true,
        refundStatus: true, updatedAt: true,
        learner: { select: { id: true, email: true, fullName: true, avatarS3Key: true, avatarUrl: true } },
        purchase: { select: { id: true, course: { select: { title: true } } } },
        messages: { where: { readBySupport: false, authorRole: 'LEARNER' }, select: { id: true } },
      },
      // Les dossiers les plus anciennement actifs remontent : personne ne doit
      // attendre indéfiniment parce qu'un dossier plus récent passe devant.
      orderBy: { lastActivityAt: 'asc' },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    db.dispute.count({ where }),
  ])
  return { items, total, page: filters.page, pageSize: filters.pageSize }
}

export async function getDisputeStats() {
  const rows = await db.dispute.groupBy({ by: ['status'], _count: { _all: true } })
  const count = (status: DisputeStatus) => rows.find((r) => r.status === status)?._count._all ?? 0
  return {
    open: count('OPEN'),
    inReview: count('IN_REVIEW'),
    waitingLearner: count('WAITING_LEARNER'),
    refunded: count('RESOLVED_REFUNDED'),
    rejected: count('RESOLVED_REJECTED'),
    auto: count('RESOLVED_AUTO'),
    total: rows.reduce((sum, r) => sum + r._count._all, 0),
  }
}

export async function getDisputeForReview(disputeId: string) {
  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    select: {
      id: true, status: true, source: true, reason: true, reasonDetail: true,
      disputedAmountFcfa: true, resolution: true, resolutionNote: true,
      overrideJustification: true, refundStatus: true, refundProcessedAt: true,
      openedAt: true, lastActivityAt: true, learnerDeadlineAt: true, resolvedAt: true,
      updatedAt: true,
      learner: { select: { id: true, email: true, fullName: true, avatarS3Key: true, avatarUrl: true } },
      trainerProfile: { select: { id: true, user: { select: { email: true, fullName: true } } } },
      purchase: {
        select: {
          id: true, amountFcfa: true, provider: true, accessSuspended: true,
          refundedAt: true, providerDisputeActive: true, createdAt: true,
          course: { select: { id: true, title: true, slug: true, format: true } },
        },
      },
      consumptionSnapshot: true,
      fundReservations: {
        select: { id: true, status: true, reservedAmountFcfa: true, debitedAmount: true, releasedAmount: true },
      },
      manualRefundTask: {
        select: { id: true, status: true, refundAmountFcfa: true, trainerDebitFcfa: true, provider: true },
      },
      messages: {
        select: { id: true, authorRole: true, body: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
      reviewEvents: {
        select: { fromStatus: true, toStatus: true, note: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
      // Les contestations du formateur : un canal séparé du fil, que
      // l'apprenant ne voit pas.
      supportTickets: {
        select: {
          id: true, reason: true, status: true, resolutionNote: true,
          resolvedAt: true, createdAt: true,
          trainer: { select: { fullName: true, email: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!dispute) return null

  // Ouvrir le dossier vaut lecture des messages de l'apprenant.
  await db.disputeMessage.updateMany({
    where: { disputeId, authorRole: 'LEARNER', readBySupport: false },
    data: { readBySupport: true },
  })

  return dispute
}

// --- Tâches de remboursement manuel ---

export async function listManualRefundTasks(status?: string) {
  return db.manualRefundTask.findMany({
    where: status ? { status } : {},
    select: {
      id: true, status: true, provider: true, refundAmountFcfa: true, trainerDebitFcfa: true,
      errorMessage: true, notes: true, createdAt: true, completedAt: true,
      dispute: {
        select: {
          id: true, disputedAmountFcfa: true, resolution: true,
          learner: { select: { email: true, fullName: true } },
          purchase: { select: { course: { select: { title: true } } } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })
}
