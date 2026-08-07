// ==========================================================================
// Lot 2 — Cohérence des soldes de portefeuille
// ==========================================================================
// Invariants surveillés (jamais réparés silencieusement — décision : on
// journalise et on alerte Finances, la correction passe par un endpoint
// Super-admin dédié) :
//
//   Wallet.reservedBalance      = SUM(FundReservation.reservedAmountFcfa WHERE ACTIVE)
//   Wallet.pendingPayoutBalance = SUM(Payout.amountFcfa WHERE status IN
//                                     (PENDING, AUTO_APPROVED, IN_REVIEW, APPROVED))
//   solde retirable             = balance - reservedBalance - pendingPayoutBalance
//   negativeSince non null      ⟺ solde retirable < 0
// ==========================================================================

import { db } from './db'
import { audit, auditStandalone } from './audit'
import { notifyAdminSubRole } from './notification'
import { WALLET_NEGATIVE_ALERT_DAYS } from './disputes'
import { IN_FLIGHT_PAYOUT_STATUSES } from './payouts'
import { withdrawableBalance } from './wallet'

export interface WalletDiscrepancy {
  walletId: string
  trainerId: string
  field: 'reservedBalance' | 'pendingPayoutBalance'
  storedValue: number
  expectedValue: number
  delta: number
}

/**
 * Détection **pure** : elle lit, compare, et n'écrit rien.
 *
 * Extraite de `reconcileAllWallets()` pour que l'écran d'administration puisse
 * afficher les écarts. La version complète journalise un
 * `WALLET_BALANCE_MISMATCH` par écart et notifie Finances : l'appeler à chaque
 * affichage remplirait le journal d'audit d'entrées identiques et enverrait une
 * notification à chaque rafraîchissement. Un écran qui regarde ne doit pas
 * laisser de trace de sa lecture.
 */
export async function listWalletDiscrepancies(): Promise<{
  checked: number
  discrepancies: WalletDiscrepancy[]
}> {
  const wallets = await db.wallet.findMany({
    select: { id: true, trainerId: true, reservedBalance: true, pendingPayoutBalance: true },
  })

  const [reservedSums, payoutSums] = await Promise.all([
    db.fundReservation.groupBy({
      by: ['walletId'],
      where: { status: 'ACTIVE' },
      _sum: { reservedAmountFcfa: true },
    }),
    db.payout.groupBy({
      by: ['trainerId'],
      where: { status: { in: IN_FLIGHT_PAYOUT_STATUSES } },
      _sum: { amountFcfa: true },
    }),
  ])

  const reservedByWallet = new Map(reservedSums.map(r => [r.walletId, r._sum.reservedAmountFcfa ?? 0]))
  const payoutByTrainer = new Map(payoutSums.map(r => [r.trainerId, r._sum.amountFcfa ?? 0]))

  const discrepancies: WalletDiscrepancy[] = []
  for (const wallet of wallets) {
    const expectedReserved = reservedByWallet.get(wallet.id) ?? 0
    if (expectedReserved !== wallet.reservedBalance) {
      discrepancies.push({
        walletId: wallet.id, trainerId: wallet.trainerId, field: 'reservedBalance',
        storedValue: wallet.reservedBalance, expectedValue: expectedReserved,
        delta: expectedReserved - wallet.reservedBalance,
      })
    }
    const expectedPending = payoutByTrainer.get(wallet.trainerId) ?? 0
    if (expectedPending !== wallet.pendingPayoutBalance) {
      discrepancies.push({
        walletId: wallet.id, trainerId: wallet.trainerId, field: 'pendingPayoutBalance',
        storedValue: wallet.pendingPayoutBalance, expectedValue: expectedPending,
        delta: expectedPending - wallet.pendingPayoutBalance,
      })
    }
  }

  return { checked: wallets.length, discrepancies }
}

/**
 * Le passage planifié : il détecte, journalise et alerte. Aucune écriture
 * corrective — la correction est un acte explicite, tracé, réservé au
 * Super-admin (`reconcileWalletField`).
 */
export async function reconcileAllWallets(): Promise<{ checked: number; discrepancies: WalletDiscrepancy[] }> {
  const { checked, discrepancies } = await listWalletDiscrepancies()

  for (const d of discrepancies) {
    // Détection uniquement : aucune écriture corrective ici.
    await auditStandalone({
      action: 'WALLET_BALANCE_MISMATCH', targetType: 'Wallet', targetId: d.walletId,
      meta: { ...d },
    })
  }

  if (discrepancies.length > 0) {
    await notifyAdminSubRole('FINANCES', {
      type: 'WALLET_BALANCE_MISMATCH',
      title: `${discrepancies.length} écart(s) de solde détecté(s)`,
      body: 'Des portefeuilles présentent un écart entre le solde stocké et le solde recalculé. Aucune correction automatique n\'a été appliquée.',
      // Cette URL pointait `/admin/wallets`, qui n'a jamais existé : l'alerte
      // menait Finances sur un 404. Les routes du back-office sont en français.
      link: '/admin/portefeuilles',
    })
  }

  return { checked, discrepancies }
}

/**
 * Correction d'un écart, réservée au Super-admin (jamais d'auto-réparation
 * silencieuse : la détection alerte, la correction est un acte explicite).
 * Chaque correction laisse une ligne `WalletReconciliation`.
 */
export async function reconcileWalletField(
  walletId: string,
  field: 'reservedBalance' | 'pendingPayoutBalance',
  params: { actorId: string; reason: string },
) {
  const wallet = await db.wallet.findUnique({
    where: { id: walletId },
    select: { id: true, trainerId: true, reservedBalance: true, pendingPayoutBalance: true },
  })
  if (!wallet) throw new Error('WALLET_NOT_FOUND')

  const expected = field === 'reservedBalance'
    ? (await db.fundReservation.aggregate({
      where: { walletId, status: 'ACTIVE' }, _sum: { reservedAmountFcfa: true },
    }))._sum.reservedAmountFcfa ?? 0
    : (await db.payout.aggregate({
      where: { trainerId: wallet.trainerId, status: { in: IN_FLIGHT_PAYOUT_STATUSES } }, _sum: { amountFcfa: true },
    }))._sum.amountFcfa ?? 0

  const previousValue = wallet[field]
  const delta = expected - previousValue

  if (delta === 0) {
    return { corrected: false, previousValue, newValue: previousValue, delta: 0 }
  }

  await db.$transaction(async (tx) => {
    await tx.wallet.update({ where: { id: walletId }, data: { [field]: expected } })
    await tx.walletReconciliation.create({
      data: {
        walletId, field,
        previousValue, newValue: expected, delta,
        reason: params.reason,
        reconciledById: params.actorId,
      },
    })
    await audit(tx, {
      actorId: params.actorId, actorRole: 'SUPER_ADMIN',
      action: 'WALLET_RECONCILED', targetType: 'Wallet', targetId: walletId,
      meta: { field, previousValue, newValue: expected, delta, reason: params.reason },
    })
  })

  return { corrected: true, previousValue, newValue: expected, delta }
}

export interface WalletOverviewRow {
  walletId: string
  trainerId: string
  trainerName: string
  balance: number
  reservedBalance: number
  pendingPayoutBalance: number
  /** `balance - reservedBalance - pendingPayoutBalance`, via `withdrawableBalance`. */
  withdrawable: number
  negativeSince: Date | null
  /** Écarts constatés sur ce portefeuille — vide quand tout concorde. */
  discrepancies: WalletDiscrepancy[]
}

/**
 * Vue d'ensemble des portefeuilles pour le back-office : soldes, écarts et
 * corrections passées, en une seule lecture.
 *
 * L'ordre n'est pas cosmétique. Ce qui réclame une décision passe devant : les
 * portefeuilles en écart, puis les négatifs, puis le reste par solde décroissant.
 * Trier par nom obligerait à chercher à l'œil le seul portefeuille qui compte.
 */
export async function getWalletOverview(): Promise<{
  rows: WalletOverviewRow[]
  checked: number
  discrepancyCount: number
  reconciliations: Array<{
    id: string
    walletId: string
    trainerName: string
    field: string
    previousValue: number
    newValue: number
    delta: number
    reason: string
    reconciledBy: string | null
    createdAt: Date
  }>
}> {
  const [wallets, detection, history] = await Promise.all([
    db.wallet.findMany({
      select: {
        id: true, trainerId: true, balance: true, reservedBalance: true,
        pendingPayoutBalance: true, negativeSince: true,
        trainerProfile: { select: { user: { select: { fullName: true, email: true } } } },
      },
    }),
    listWalletDiscrepancies(),
    db.walletReconciliation.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, walletId: true, field: true, previousValue: true, newValue: true,
        delta: true, reason: true, reconciledById: true, createdAt: true,
      },
    }),
  ])

  const byWallet = new Map<string, WalletDiscrepancy[]>()
  for (const d of detection.discrepancies) {
    const list = byWallet.get(d.walletId)
    if (list) list.push(d)
    else byWallet.set(d.walletId, [d])
  }

  const nameOf = (wallet: (typeof wallets)[number]) =>
    wallet.trainerProfile?.user?.fullName ||
    wallet.trainerProfile?.user?.email ||
    `Formateur ${wallet.trainerId.slice(0, 8)}…`

  const rows: WalletOverviewRow[] = wallets.map((wallet) => ({
    walletId: wallet.id,
    trainerId: wallet.trainerId,
    trainerName: nameOf(wallet),
    balance: wallet.balance,
    reservedBalance: wallet.reservedBalance,
    pendingPayoutBalance: wallet.pendingPayoutBalance,
    withdrawable: withdrawableBalance(wallet),
    negativeSince: wallet.negativeSince,
    discrepancies: byWallet.get(wallet.id) ?? [],
  }))

  rows.sort((a, b) => {
    if (a.discrepancies.length !== b.discrepancies.length) {
      return b.discrepancies.length - a.discrepancies.length
    }
    const aNegative = a.withdrawable < 0 ? 1 : 0
    const bNegative = b.withdrawable < 0 ? 1 : 0
    if (aNegative !== bNegative) return bNegative - aNegative
    return b.balance - a.balance
  })

  // Les auteurs des corrections sont résolus en une requête : l'historique peut
  // être long et une jointure par ligne le rendrait illisible en base.
  const actorIds = [...new Set(history.map((h) => h.reconciledById))]
  const actors = actorIds.length
    ? await db.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, fullName: true, email: true },
    })
    : []
  const actorById = new Map(actors.map((a) => [a.id, a.fullName || a.email]))
  const walletName = new Map(rows.map((r) => [r.walletId, r.trainerName]))

  return {
    rows,
    checked: detection.checked,
    discrepancyCount: detection.discrepancies.length,
    reconciliations: history.map((h) => ({
      ...h,
      trainerName: walletName.get(h.walletId) ?? `Portefeuille ${h.walletId.slice(0, 8)}…`,
      reconciledBy: actorById.get(h.reconciledById) ?? null,
    })),
  }
}

/**
 * Décision 13 — le solde négatif est autorisé, mais un portefeuille qui reste
 * négatif plus de 60 jours déclenche une alerte Finances.
 */
export async function alertNegativeWallets(): Promise<{ negative: number; alerted: number }> {
  const wallets = await db.wallet.findMany({
    select: { id: true, trainerId: true, balance: true, reservedBalance: true, pendingPayoutBalance: true, negativeSince: true },
  })

  const threshold = new Date(Date.now() - WALLET_NEGATIVE_ALERT_DAYS * 86_400_000)
  let negative = 0
  let alerted = 0

  for (const wallet of wallets) {
    const withdrawable = wallet.balance - wallet.reservedBalance - wallet.pendingPayoutBalance

    // negativeSince est un marqueur dérivé, pas un solde : on le resynchronise.
    if (withdrawable < 0 && !wallet.negativeSince) {
      await db.wallet.update({ where: { id: wallet.id }, data: { negativeSince: new Date() } })
      negative++
      continue
    }
    if (withdrawable >= 0) {
      if (wallet.negativeSince) await db.wallet.update({ where: { id: wallet.id }, data: { negativeSince: null } })
      continue
    }

    negative++
    if (wallet.negativeSince && wallet.negativeSince < threshold) {
      alerted++
      await auditStandalone({
        action: 'WALLET_NEGATIVE_ALERT', targetType: 'Wallet', targetId: wallet.id,
        meta: {
          trainerId: wallet.trainerId, withdrawable,
          negativeSince: wallet.negativeSince.toISOString(),
          days: Math.floor((Date.now() - wallet.negativeSince.getTime()) / 86_400_000),
        },
      })
      await notifyAdminSubRole('FINANCES', {
        type: 'WALLET_NEGATIVE_ALERT',
        title: 'Portefeuille négatif depuis plus de 60 jours',
        body: `Solde retirable : ${withdrawable} FCFA. Le solde n'a pas été apuré par les ventes suivantes.`,
        // Même correction : il n'y a pas de fiche par portefeuille, mais l'écran
        // de liste met les négatifs en tête. Un lien qui atterrit vaut mieux
        // qu'un lien précis vers une page absente.
        link: '/admin/portefeuilles',
      })
    }
  }

  return { negative, alerted }
}
