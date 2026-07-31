// ==========================================================================
// Lot 2 — ManualRefundTask : remboursements CinetPay traités par Finances
// ==========================================================================

import { db } from './db'
import { audit, auditStandalone } from './audit'
import { completeRefund } from './disputes'

export const MANUAL_REFUND_TASK_ERRORS: Record<string, { status: number; message: string }> = {
  TASK_NOT_FOUND: { status: 404, message: 'Tâche de remboursement introuvable' },
  INVALID_TASK_STATUS: { status: 409, message: 'Tâche déjà traitée' },
}

export async function listManualRefundTasks(status?: 'PENDING' | 'COMPLETED' | 'CANCELLED', page = 1, pageSize = 20) {
  const where = status ? { status } : {}
  const [items, total] = await Promise.all([
    db.manualRefundTask.findMany({ where, orderBy: { createdAt: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
    db.manualRefundTask.count({ where }),
  ])
  return { items, total, page, pageSize }
}

// --- Marquer une tâche complétée : applique FR3/FR4 sur le litige associé ---

export async function completeManualRefundTask(taskId: string, financeId: string): Promise<void> {
  const task = await db.manualRefundTask.findUnique({ where: { id: taskId } })
  if (!task) throw new Error('TASK_NOT_FOUND')
  if (task.status !== 'PENDING') throw new Error('INVALID_TASK_STATUS')

  const res = await db.manualRefundTask.updateMany({ where: { id: taskId, status: 'PENDING' }, data: { status: 'COMPLETED', completedAt: new Date(), assignedToId: financeId } })
  if (res.count === 0) return // idempotent : déjà traitée entre-temps

  await completeRefund(task.disputeId, task.refundAmountFcfa, null, financeId)
  await auditStandalone({ actorId: financeId, actorRole: 'FINANCES', action: 'MANUAL_REFUND_TASK_COMPLETED', targetType: 'ManualRefundTask', targetId: taskId, meta: { disputeId: task.disputeId, refundAmountFcfa: task.refundAmountFcfa } })
}

// --- FR5 : annuler une tâche de remboursement manuel — libère la réservation sans débiter ---

export async function cancelManualRefundTask(taskId: string, financeId: string, notes?: string): Promise<void> {
  const task = await db.manualRefundTask.findUnique({ where: { id: taskId } })
  if (!task) throw new Error('TASK_NOT_FOUND')
  if (task.status !== 'PENDING') throw new Error('INVALID_TASK_STATUS')

  await db.$transaction(async (tx) => {
    const res = await tx.manualRefundTask.updateMany({ where: { id: taskId, status: 'PENDING' }, data: { status: 'CANCELLED', notes } })
    if (res.count === 0) return

    const dispute = await tx.dispute.findUnique({ where: { id: task.disputeId }, include: { fundReservations: true } })
    if (!dispute) return
    const reservation = dispute.fundReservations.find(r => r.status === 'ACTIVE')
    if (reservation) {
      await tx.fundReservation.update({ where: { id: reservation.id }, data: { status: 'RELEASED', releasedAt: new Date(), releasedById: financeId, releaseReason: 'MANUAL_REFUND_TASK_CANCELLED' } })
      await tx.wallet.update({ where: { id: reservation.walletId }, data: { reservedBalance: { decrement: reservation.reservedAmountFcfa } } })
    }
    await tx.dispute.update({ where: { id: task.disputeId }, data: { refundStatus: 'FAILED' } })
    await audit(tx, { actorId: financeId, actorRole: 'FINANCES', action: 'FUND_RESERVATION_RELEASED_ON_CANCEL', targetType: 'ManualRefundTask', targetId: taskId, meta: { disputeId: task.disputeId } })
  })
}
