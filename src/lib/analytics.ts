// ==========================================================================
// Vue d'ensemble — écran Analytics (Super-admin)
// ==========================================================================
// Aucune collecte nouvelle : tout est agrégé depuis les tables existantes.
// C'est délibéré — un indicateur qui demande sa propre instrumentation est un
// indicateur qu'on n'a pas encore décidé de piloter.
// ==========================================================================

import { db } from './db'

const SOLD = { providerStatus: 'SUCCEEDED', refundedAt: null } as const

export interface PlatformOverview {
  users: { learners: number; trainers: number; admins: number; newLast30Days: number }
  catalog: { published: number; draft: number; archived: number; communities: number }
  sales: { count: number; grossFcfa: number; platformShareFcfa: number; last30DaysFcfa: number }
  moderation: { openReports: number; openDisputes: number; pendingApplications: number }
  payouts: { inFlightFcfa: number; paidFcfa: number; pendingReview: number }
  /** Les 5 formateurs par revenu net cumulé — qui porte réellement la plateforme. */
  topTrainers: Array<{ trainerId: string; name: string; salesCount: number; netRevenueFcfa: number }>
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const monthAgo = new Date(Date.now() - 30 * 86_400_000)

  const [
    usersByRole, newUsers, coursesByStatus, communities,
    sales, salesLast30, reports, disputes, applications,
    payoutsInFlight, payoutsPaid, payoutsPending, topRows,
  ] = await Promise.all([
    db.user.groupBy({ by: ['role'], where: { deletedAt: null }, _count: { _all: true } }),
    db.user.count({ where: { deletedAt: null, createdAt: { gte: monthAgo } } }),
    db.course.groupBy({ by: ['status'], _count: { _all: true } }),
    db.community.count(),
    db.purchase.aggregate({
      where: SOLD,
      _count: { _all: true },
      _sum: { amountFcfa: true, platformShareFcfa: true },
    }),
    db.purchase.aggregate({
      where: { ...SOLD, createdAt: { gte: monthAgo } },
      _sum: { amountFcfa: true },
    }),
    db.report.count({ where: { status: 'OPEN' } }),
    db.dispute.count({ where: { status: { in: ['OPEN', 'IN_REVIEW', 'WAITING_LEARNER'] } } }),
    db.trainerApplication.count({ where: { status: 'SUBMITTED' } }),
    db.payout.aggregate({
      where: { status: { in: ['PENDING', 'AUTO_APPROVED', 'IN_REVIEW', 'APPROVED'] } },
      _sum: { amountFcfa: true },
    }),
    db.payout.aggregate({ where: { status: 'PAID' }, _sum: { amountFcfa: true } }),
    db.payout.count({ where: { status: 'IN_REVIEW' } }),
    db.purchase.groupBy({
      by: ['trainerId'],
      where: SOLD,
      _count: { _all: true },
      _sum: { trainerShareFcfa: true },
      orderBy: { _sum: { trainerShareFcfa: 'desc' } },
      take: 5,
    }),
  ])

  const roleCounts = Object.fromEntries(usersByRole.map(r => [r.role, r._count._all]))
  const statusCounts = Object.fromEntries(coursesByStatus.map(r => [r.status, r._count._all]))

  // Les noms sont résolus en une requête plutôt qu'une par ligne du classement.
  const profiles = topRows.length
    ? await db.trainerProfile.findMany({
        where: { id: { in: topRows.map(r => r.trainerId) } },
        select: { id: true, user: { select: { email: true, fullName: true } } },
      })
    : []
  const nameById = new Map(profiles.map(p => [p.id, p.user.fullName ?? p.user.email]))

  return {
    users: {
      learners: roleCounts.LEARNER ?? 0,
      trainers: roleCounts.TRAINER ?? 0,
      admins: roleCounts.ADMIN ?? 0,
      newLast30Days: newUsers,
    },
    catalog: {
      published: statusCounts.published ?? 0,
      draft: statusCounts.draft ?? 0,
      archived: statusCounts.archived ?? 0,
      communities,
    },
    sales: {
      count: sales._count._all,
      grossFcfa: sales._sum.amountFcfa ?? 0,
      platformShareFcfa: sales._sum.platformShareFcfa ?? 0,
      last30DaysFcfa: salesLast30._sum.amountFcfa ?? 0,
    },
    moderation: { openReports: reports, openDisputes: disputes, pendingApplications: applications },
    payouts: {
      inFlightFcfa: payoutsInFlight._sum.amountFcfa ?? 0,
      paidFcfa: payoutsPaid._sum.amountFcfa ?? 0,
      pendingReview: payoutsPending,
    },
    topTrainers: topRows.map(row => ({
      trainerId: row.trainerId,
      name: nameById.get(row.trainerId) ?? 'Formateur supprimé',
      salesCount: row._count._all,
      netRevenueFcfa: row._sum.trainerShareFcfa ?? 0,
    })),
  }
}
