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

export interface WalletDiscrepancy {
  walletId: string
  trainerId: string
  field: 'reservedBalance' | 'pendingPayoutBalance'
  storedValue: number
  expectedValue: number
  delta: number
}

export async function reconcileAllWallets(): Promise<{ checked: number; discrepancies: WalletDiscrepancy[] }> {
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
      link: '/admin/wallets',
    })
  }

  return { checked: wallets.length, discrepancies }
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
        link: `/admin/wallets/${wallet.id}`,
      })
    }
  }

  return { negative, alerted }
}
