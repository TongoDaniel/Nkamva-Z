// ==========================================================================
// Lot 3 §6 — Réconciliation des invariants Wallet (Super-admin)
// INVARIANT 1 : reservedBalance = SUM(FundReservation.reservedAmountFcfa WHERE status = ACTIVE)
// INVARIANT 2 : pendingPayoutBalance = SUM(Payout.amountFcfa WHERE status IN PENDING,AUTO_APPROVED,IN_REVIEW,APPROVED)
// ==========================================================================

import { db } from './db'
import { audit } from './audit'

export const WALLET_RECONCILIATION_ERRORS: Record<string, { status: number; message: string }> = {
  WALLET_NOT_FOUND: { status: 404, message: 'Wallet introuvable' },
}

export async function reconcileReservedBalance(walletId: string, superAdminId: string): Promise<{ changed: boolean; delta: number }> {
  const wallet = await db.wallet.findUnique({ where: { id: walletId } })
  if (!wallet) throw new Error('WALLET_NOT_FOUND')

  const sum = await db.fundReservation.aggregate({ where: { walletId, status: 'ACTIVE' }, _sum: { reservedAmountFcfa: true } })
  const correct = sum._sum.reservedAmountFcfa || 0
  if (correct === wallet.reservedBalance) return { changed: false, delta: 0 }

  const delta = correct - wallet.reservedBalance
  await db.$transaction(async (tx) => {
    await tx.wallet.update({ where: { id: walletId }, data: { reservedBalance: correct } })
    await tx.walletReconciliation.create({ data: { walletId, field: 'reservedBalance', previousValue: wallet.reservedBalance, newValue: correct, delta, reason: 'Réconciliation manuelle Super-admin', reconciledById: superAdminId } })
    await audit(tx, { actorId: superAdminId, actorRole: 'SUPER_ADMIN', action: 'WALLET_RESERVED_BALANCE_RECONCILED', targetType: 'Wallet', targetId: walletId, meta: { previousValue: wallet.reservedBalance, newValue: correct, delta } })
  })
  return { changed: true, delta }
}

export async function reconcilePendingPayoutBalance(walletId: string, superAdminId: string): Promise<{ changed: boolean; delta: number }> {
  const wallet = await db.wallet.findUnique({ where: { id: walletId } })
  if (!wallet) throw new Error('WALLET_NOT_FOUND')

  const sum = await db.payout.aggregate({ where: { trainerId: wallet.trainerId, status: { in: ['PENDING', 'AUTO_APPROVED', 'IN_REVIEW', 'APPROVED'] } }, _sum: { amountFcfa: true } })
  const correct = sum._sum.amountFcfa || 0
  if (correct === wallet.pendingPayoutBalance) return { changed: false, delta: 0 }

  const delta = correct - wallet.pendingPayoutBalance
  await db.$transaction(async (tx) => {
    await tx.wallet.update({ where: { id: walletId }, data: { pendingPayoutBalance: correct } })
    await tx.walletReconciliation.create({ data: { walletId, field: 'pendingPayoutBalance', previousValue: wallet.pendingPayoutBalance, newValue: correct, delta, reason: 'Réconciliation manuelle Super-admin', reconciledById: superAdminId } })
    await audit(tx, { actorId: superAdminId, actorRole: 'SUPER_ADMIN', action: 'WALLET_PENDING_PAYOUT_BALANCE_RECONCILED', targetType: 'Wallet', targetId: walletId, meta: { previousValue: wallet.pendingPayoutBalance, newValue: correct, delta } })
  })
  return { changed: true, delta }
}
