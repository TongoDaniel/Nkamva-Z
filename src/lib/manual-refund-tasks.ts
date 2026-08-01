// ==========================================================================
// Lot 2 — Tâches de remboursement manuel (Finances)
// ==========================================================================
// Décision 15 — quand le refund provider n'est pas exécutable (CinetPay sans
// clés API, ou échec de l'appel Stripe), le remboursement bascule en tâche
// manuelle explicite plutôt qu'en retry silencieux.
// ==========================================================================

import { db } from './db'
import { audit, auditStandalone } from './audit'
import { notify, deliverSideEffects } from './notification'
import { completeRefund, releaseFundReservation } from './disputes'

export type ManualRefundTaskStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED'

export async function listManualRefundTasks(filters: { status?: string; page?: number; pageSize?: number }) {
  const page = filters.page ?? 1
  const pageSize = Math.min(filters.pageSize ?? 20, 50)
  const where = filters.status ? { status: filters.status } : {}

  const [items, total] = await Promise.all([
    db.manualRefundTask.findMany({
      where,
      include: {
        dispute: {
          select: {
            id: true, status: true, resolution: true, refundStatus: true, disputedAmountFcfa: true,
            learner: { select: { id: true, email: true, fullName: true } },
            trainerProfile: { select: { id: true, verifiedLegalName: true } },
            purchase: { select: { id: true, provider: true, providerTransactionId: true, course: { select: { title: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.manualRefundTask.count({ where }),
  ])
  return { items, total, page, pageSize }
}

/**
 * Le virement a été exécuté hors plateforme : on applique enfin FR3/FR4
 * (débit réel du formateur) et on marque l'achat remboursé.
 */
export async function completeManualRefundTask(
  taskId: string,
  params: { actorId: string; providerRefundId?: string | null; notes?: string | null },
) {
  const task = await db.manualRefundTask.findUnique({
    where: { id: taskId },
    select: { id: true, disputeId: true, status: true, refundAmountFcfa: true },
  })
  if (!task) throw new Error('TASK_NOT_FOUND')
  if (task.status !== 'PENDING') throw new Error('TASK_NOT_PENDING')

  await completeRefund(task.disputeId, params.providerRefundId ?? null, params.actorId)

  await db.manualRefundTask.update({
    where: { id: taskId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      assignedToId: params.actorId,
      notes: params.notes ?? null,
      errorMessage: null,
    },
  })

  await auditStandalone({
    actorId: params.actorId, actorRole: 'FINANCES',
    action: 'MANUAL_REFUND_TASK_COMPLETED', targetType: 'ManualRefundTask', targetId: taskId,
    meta: { disputeId: task.disputeId, refundAmountFcfa: task.refundAmountFcfa, providerRefundId: params.providerRefundId ?? null },
  })

  return db.manualRefundTask.findUnique({ where: { id: taskId } })
}

/**
 * FR5 — la tâche est annulée : la réservation est libérée SANS débiter le
 * formateur (aucun argent n'a bougé). L'accès de l'apprenant est rétabli,
 * puisqu'il n'aura finalement pas été remboursé.
 */
export async function cancelManualRefundTask(
  taskId: string,
  params: { actorId: string; reason: string },
) {
  const task = await db.manualRefundTask.findUnique({
    where: { id: taskId },
    select: { id: true, disputeId: true, status: true, refundAmountFcfa: true },
  })
  if (!task) throw new Error('TASK_NOT_FOUND')
  if (task.status !== 'PENDING') throw new Error('TASK_NOT_PENDING')

  const released = await releaseFundReservation(task.disputeId, {
    actorId: params.actorId,
    reason: 'MANUAL_REFUND_CANCELLED',
  })

  const dispute = await db.$transaction(async (tx) => {
    await tx.manualRefundTask.update({
      where: { id: taskId },
      data: { status: 'CANCELLED', assignedToId: params.actorId, notes: params.reason, completedAt: new Date() },
    })
    const updated = await tx.dispute.update({
      where: { id: task.disputeId },
      data: { refundStatus: 'FAILED' },
      select: { id: true, learnerId: true, purchaseId: true },
    })
    await tx.purchase.update({
      where: { id: updated.purchaseId },
      data: { accessSuspended: false, accessRestoredAt: new Date(), refundAmountFcfa: null },
    })
    await audit(tx, {
      actorId: params.actorId, actorRole: 'FINANCES',
      action: 'MANUAL_REFUND_TASK_CANCELLED', targetType: 'ManualRefundTask', targetId: taskId,
      meta: { disputeId: task.disputeId, releasedFcfa: released, reason: params.reason },
    })
    return updated
  })

  await deliverSideEffects('MANUAL_REFUND_TASK_CANCELLED', { type: 'ManualRefundTask', id: taskId }, () =>
    notify(dispute.learnerId, {
      type: 'DISPUTE_REFUND_CANCELLED',
      title: 'Le remboursement n\'a pas pu être exécuté',
      body: params.reason,
      link: `/mes-litiges/${task.disputeId}`,
    }),
  )

  return db.manualRefundTask.findUnique({ where: { id: taskId } })
}
