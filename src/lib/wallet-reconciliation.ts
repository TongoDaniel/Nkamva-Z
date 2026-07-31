// ==========================================================================
// Lot 3 §6 / Lot 2 §7 — Réconciliation des invariants Wallet
// INVARIANT 1 : reservedBalance = SUM(FundReservation.reservedAmountFcfa WHERE status = ACTIVE)
// INVARIANT 2 : pendingPayoutBalance = SUM(Payout.amountFcfa WHERE status IN PENDING,AUTO_APPROVED,IN_REVIEW,APPROVED)
// ==========================================================================

import { db } from './db'
import { audit, auditStandalone } from './audit'
import { notifyAdminSubRole } from './notification'

export const WALLET_NEGATIVE_ALERT_DAYS = 60

export const WALLET_RECONCILIATION_ERRORS: Record<string, { status: number; message: string }> = {
  WALLET_NOT_FOUND: { status: 404, message: 'Wallet introuvable' },
}

export async function reconcileReservedBalance(walletId: string, actorId: string, reason = 'Réconciliation manuelle Super-admin'): Promise<{ changed: boolean; delta: number }> {
  const wallet = await db.wallet.findUnique({ where: { id: walletId } })
  if (!wallet) throw new Error('WALLET_NOT_FOUND')

  const sum = await db.fundReservation.aggregate({ where: { walletId, status: 'ACTIVE' }, _sum: { reservedAmountFcfa: true } })
  const correct = sum._sum.reservedAmountFcfa || 0
  if (correct === wallet.reservedBalance) return { changed: false, delta: 0 }

  const delta = correct - wallet.reservedBalance
  await db.$transaction(async (tx) => {
    await tx.wallet.update({ where: { id: walletId }, data: { reservedBalance: correct } })
    await tx.walletReconciliation.create({ data: { walletId, field: 'reservedBalance', previousValue: wallet.reservedBalance, newValue: correct, delta, reason, reconciledById: actorId } })
    await audit(tx, { actorId, actorRole: actorId === 'SYSTEM' ? 'SYSTEM' : 'SUPER_ADMIN', action: 'WALLET_RESERVED_BALANCE_RECONCILED', targetType: 'Wallet', targetId: walletId, meta: { previousValue: wallet.reservedBalance, newValue: correct, delta } })
  })
  return { changed: true, delta }
}

export async function reconcilePendingPayoutBalance(walletId: string, actorId: string, reason = 'Réconciliation manuelle Super-admin'): Promise<{ changed: boolean; delta: number }> {
  const wallet = await db.wallet.findUnique({ where: { id: walletId } })
  if (!wallet) throw new Error('WALLET_NOT_FOUND')

  const sum = await db.payout.aggregate({ where: { trainerId: wallet.trainerId, status: { in: ['PENDING', 'AUTO_APPROVED', 'IN_REVIEW', 'APPROVED'] } }, _sum: { amountFcfa: true } })
  const correct = sum._sum.amountFcfa || 0
  if (correct === wallet.pendingPayoutBalance) return { changed: false, delta: 0 }

  const delta = correct - wallet.pendingPayoutBalance
  await db.$transaction(async (tx) => {
    await tx.wallet.update({ where: { id: walletId }, data: { pendingPayoutBalance: correct } })
    await tx.walletReconciliation.create({ data: { walletId, field: 'pendingPayoutBalance', previousValue: wallet.pendingPayoutBalance, newValue: correct, delta, reason, reconciledById: actorId } })
    await audit(tx, { actorId, actorRole: actorId === 'SYSTEM' ? 'SYSTEM' : 'SUPER_ADMIN', action: 'WALLET_PENDING_PAYOUT_BALANCE_RECONCILED', targetType: 'Wallet', targetId: walletId, meta: { previousValue: wallet.pendingPayoutBalance, newValue: correct, delta } })
  })
  return { changed: true, delta }
}

// --- Lot 2 §7 : cohérence wallet (job quotidien 03:30 UTC) — réconcilie tous les wallets ---

export async function reconcileAllWallets(): Promise<{ walletsChecked: number; discrepanciesFixed: number }> {
  const wallets = await db.wallet.findMany({ select: { id: true } })
  let discrepanciesFixed = 0
  for (const w of wallets) {
    const r1 = await reconcileReservedBalance(w.id, 'SYSTEM', 'Réconciliation automatique quotidienne')
    const r2 = await reconcilePendingPayoutBalance(w.id, 'SYSTEM', 'Réconciliation automatique quotidienne')
    if (r1.changed) discrepanciesFixed++
    if (r2.changed) discrepanciesFixed++
  }
  return { walletsChecked: wallets.length, discrepanciesFixed }
}

// --- Lot 2 §7 : alerte wallet négatif > 60 jours (job quotidien 03:30 UTC) ---

export async function alertNegativeWallets(): Promise<number> {
  const cutoff = new Date(Date.now() - WALLET_NEGATIVE_ALERT_DAYS * 86400000)
  const negative = await db.wallet.findMany({ where: { negativeSince: { lt: cutoff } } })
  if (negative.length > 0) {
    await auditStandalone({ action: 'WALLET_NEGATIVE_ALERT', meta: { count: negative.length, walletIds: negative.map(w => w.id) } })
    await notifyAdminSubRole('SUPER_ADMIN', {
      type: 'WALLET_NEGATIVE_ALERT', title: `${negative.length} wallet(s) négatif(s) depuis plus de ${WALLET_NEGATIVE_ALERT_DAYS} jours`,
      body: 'Vérification requise.', link: '/admin/finances',
    })
  }
  return negative.length
}
