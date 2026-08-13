// ==========================================================================
// Agrégats de l'espace formateur : ventes, revenus, solde
// ==========================================================================
// Dérivés de Purchase et Wallet, qui sont la source de vérité du Lot 0/4.
// Aucun compteur n'est stocké : rien à resynchroniser, rien à faire dériver.
// ==========================================================================

import { db } from './db'
import { withdrawableBalance } from './wallet'

export interface TrainerOverview {
  courseCount: number
  publishedCount: number
  draftCount: number
  archivedCount: number
  /** Achats confirmés, remboursements exclus. */
  salesCount: number
  /** Part formateur cumulée sur ces achats. */
  netRevenueFcfa: number
  /** Solde du wallet, crédité par les webhooks. */
  walletBalanceFcfa: number
  walletReservedFcfa: number
}

/** Seuls les achats réellement encaissés comptent comme des ventes. */
const SOLD = { providerStatus: 'SUCCEEDED', refundedAt: null } as const

export async function getTrainerOverview(trainerId: string): Promise<TrainerOverview> {
  const [byStatus, sales, wallet] = await Promise.all([
    db.course.groupBy({
      by: ['status'],
      where: { trainerId },
      _count: { _all: true },
    }),
    db.purchase.aggregate({
      where: { trainerId, ...SOLD },
      _count: { _all: true },
      _sum: { trainerShareFcfa: true },
    }),
    db.wallet.findUnique({
      where: { trainerId },
      select: { balance: true, reservedBalance: true },
    }),
  ])

  const count = (status: string) =>
    byStatus.find((row) => row.status === status)?._count._all ?? 0

  return {
    courseCount: byStatus.reduce((total, row) => total + row._count._all, 0),
    publishedCount: count('published'),
    draftCount: count('draft'),
    archivedCount: count('archived'),
    salesCount: sales._count._all,
    netRevenueFcfa: sales._sum.trainerShareFcfa ?? 0,
    walletBalanceFcfa: wallet?.balance ?? 0,
    walletReservedFcfa: wallet?.reservedBalance ?? 0,
  }
}

export interface TrainerWallet {
  balanceFcfa: number
  reservedFcfa: number
  pendingPayoutFcfa: number
  /** `balance - reserved - pendingPayout`, la seule somme réellement demandable. */
  withdrawableFcfa: number
  negativeSince: Date | null
}

/**
 * Le détail du solde, pour l'écran portefeuille. `getTrainerOverview` n'en
 * expose que deux composantes : afficher un montant retirable sans montrer ce
 * qui en a été retiré rendrait l'écart incompréhensible.
 */
export async function getTrainerWallet(trainerId: string): Promise<TrainerWallet> {
  const wallet = await db.wallet.findUnique({
    where: { trainerId },
    select: { balance: true, reservedBalance: true, pendingPayoutBalance: true, negativeSince: true },
  })

  const balance = wallet?.balance ?? 0
  const reserved = wallet?.reservedBalance ?? 0
  const pending = wallet?.pendingPayoutBalance ?? 0

  return {
    balanceFcfa: balance,
    reservedFcfa: reserved,
    pendingPayoutFcfa: pending,
    withdrawableFcfa: withdrawableBalance({
      balance,
      reservedBalance: reserved,
      pendingPayoutBalance: pending,
    }),
    negativeSince: wallet?.negativeSince ?? null,
  }
}

/**
 * Litiges qui attendent encore quelque chose **du formateur**.
 *
 * Il n'existe pas de statut « en attente du formateur » : sa défense n'entre
 * pas dans le fil du litige, elle prend la forme d'un `SupportTicket` rattaché
 * au dossier (décision 19, voir `trainer-disputes.ts`) — sans quoi l'apprenant,
 * qui lit le fil, découvrirait sa version. Un dossier encore ouvert sur lequel
 * il n'a déposé aucun ticket est donc exactement ce sur quoi il n'a pas répondu.
 *
 * Aucune échéance ne pèse sur lui : `learnerDeadlineAt` est le seul délai en
 * base, et il court contre l'apprenant. L'écran qui affiche ce compte ne doit
 * annoncer aucun compte à rebours.
 */
export async function countDisputesToContest(trainerId: string): Promise<number> {
  return db.dispute.count({
    where: {
      trainerId,
      status: { in: ['OPEN', 'IN_REVIEW'] },
      supportTickets: { none: {} },
    },
  })
}

export interface CourseSales {
  courseId: string
  salesCount: number
  netRevenueFcfa: number
}

/** Ventes par cours, en une seule requête plutôt qu'une par ligne affichée. */
export async function getSalesByCourse(trainerId: string): Promise<Map<string, CourseSales>> {
  const rows = await db.purchase.groupBy({
    by: ['courseId'],
    where: { trainerId, courseId: { not: null }, ...SOLD },
    _count: { _all: true },
    _sum: { trainerShareFcfa: true },
  })

  return new Map(
    rows
      .filter((row): row is typeof row & { courseId: string } => row.courseId !== null)
      .map((row) => [
        row.courseId,
        {
          courseId: row.courseId,
          salesCount: row._count._all,
          netRevenueFcfa: row._sum.trainerShareFcfa ?? 0,
        },
      ]),
  )
}
