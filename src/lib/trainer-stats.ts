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

// ==========================================================================
// Historique des ventes, ligne à ligne (F7.11, arbitrage 125)
// ==========================================================================
// Le tableau de bord donnait des agrégats — « 12 ventes confirmées », un net
// par ressource. Un solde global ne dit pas d'où vient l'argent : l'audit du
// 1er septembre demande, pour chaque vente, ce qui a été vendu, quand, le brut,
// la commission retenue, le net et le statut.
//
// **Rien n'est recalculé ici.** Les parts sont figées sur l'achat à la vente
// (décision 11) : un taux de commission qui évolue ne réécrit pas le passé, et
// un écran qui referait la division afficherait autre chose que ce qui a été
// réellement crédité. `lib/commission.ts` ne sert qu'au taux **annoncé**, pour
// le public — jamais à reconstituer une vente passée.
// ==========================================================================

export interface TrainerSaleRow {
  id: string
  createdAt: Date
  /** Ce qui a été vendu — une ressource, ou une adhésion à la communauté. */
  subject: { kind: 'COURSE'; title: string; slug: string; format: string }
    | { kind: 'COMMUNITY'; title: string; slug: string }
    | { kind: 'GONE' }
  provider: string
  providerStatus: string
  amountFcfa: number
  /** Le taux tel qu'il était **à la vente**, pas celui d'aujourd'hui. */
  commissionRate: number
  platformShareFcfa: number
  trainerShareFcfa: number
  refundedAt: Date | null
  refundAmountFcfa: number | null
  accessSuspended: boolean
  disputeActive: boolean
}

export interface TrainerSalesPage {
  rows: TrainerSaleRow[]
  total: number
  page: number
  pageSize: number
}

/**
 * Une page de l'historique, de la plus récente à la plus ancienne.
 *
 * Les tentatives non abouties en font partie : une vente qui a échoué explique
 * un écart entre ce qu'un formateur croit avoir vendu et ce qu'il a encaissé.
 * Les masquer laisserait ce trou sans réponse.
 */
export async function listTrainerSales(
  trainerId: string,
  page: number,
  pageSize: number,
): Promise<TrainerSalesPage> {
  // Une tentative annulée n'est pas une vente : elle apparaissait « Annulée
  // 20 000 FCFA » dans l'historique de la formatrice après un double clic de
  // l'acheteur (m9). Le registre de Finances, lui, garde tout.
  const where = { trainerId, providerStatus: { not: 'CANCELED' as const } }
  const [rows, total] = await Promise.all([
    db.purchase.findMany({
      where,
      select: {
        id: true, createdAt: true, provider: true, providerStatus: true,
        amountFcfa: true, commissionRate: true,
        platformShareFcfa: true, trainerShareFcfa: true,
        refundedAt: true, refundAmountFcfa: true,
        accessSuspended: true, providerDisputeActive: true,
        course: { select: { title: true, slug: true, format: true } },
        community: { select: { name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.purchase.count({ where }),
  ])

  return {
    rows: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      // Une ressource supprimée laisse son achat : la ligne doit rester
      // lisible, faute de quoi le total ne s'expliquerait plus.
      subject: row.course
        ? { kind: 'COURSE' as const, title: row.course.title, slug: row.course.slug, format: row.course.format }
        : row.community
          ? { kind: 'COMMUNITY' as const, title: row.community.name, slug: row.community.slug }
          : { kind: 'GONE' as const },
      provider: row.provider,
      providerStatus: row.providerStatus,
      amountFcfa: row.amountFcfa,
      commissionRate: row.commissionRate,
      platformShareFcfa: row.platformShareFcfa,
      trainerShareFcfa: row.trainerShareFcfa,
      refundedAt: row.refundedAt,
      refundAmountFcfa: row.refundAmountFcfa,
      accessSuspended: row.accessSuspended,
      disputeActive: row.providerDisputeActive,
    })),
    total,
    page,
    pageSize,
  }
}

export interface TrainerSalesSummary {
  /** Nombre de ventes réellement encaissées, remboursements exclus. */
  count: number
  grossFcfa: number
  commissionFcfa: number
  netFcfa: number
  /** Ventes remboursées — comptées à part, pas soustraites des précédentes. */
  refundedCount: number
  refundedFcfa: number
}

/**
 * Les trois montants de tête, sur les seules ventes encaissées.
 *
 * Les remboursements sont **comptés à côté**, pas retranchés : mêler les deux
 * donnerait un « brut » qui ne correspond à aucune ligne du tableau, et un
 * formateur qui additionne sa colonne ne retomberait pas dessus.
 */
export async function getTrainerSalesSummary(trainerId: string): Promise<TrainerSalesSummary> {
  const [sold, refunded] = await Promise.all([
    db.purchase.aggregate({
      where: { trainerId, ...SOLD },
      _count: { _all: true },
      _sum: { amountFcfa: true, platformShareFcfa: true, trainerShareFcfa: true },
    }),
    db.purchase.aggregate({
      where: { trainerId, refundedAt: { not: null } },
      _count: { _all: true },
      _sum: { refundAmountFcfa: true },
    }),
  ])

  return {
    count: sold._count._all,
    grossFcfa: sold._sum.amountFcfa ?? 0,
    commissionFcfa: sold._sum.platformShareFcfa ?? 0,
    netFcfa: sold._sum.trainerShareFcfa ?? 0,
    refundedCount: refunded._count._all,
    refundedFcfa: refunded._sum.refundAmountFcfa ?? 0,
  }
}
