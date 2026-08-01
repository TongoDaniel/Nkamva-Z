// ==========================================================================
// Lot 2 — Chargebacks opérateur (T1 source provider, T9, T10)
// ==========================================================================
// Un chargeback n'est pas une demande : c'est une décision prise ailleurs. La
// banque a déjà saisi l'opérateur, et nous n'avons pas à juger si elle est
// recevable — les contrôles des 14 jours et des 30 % ne s'appliquent donc pas.
//
// Le risque à couvrir est le double débit (décision 17). Si l'achat a déjà été
// remboursé par nos soins, laisser le chargeback suivre son cours ferait payer
// deux fois le formateur : on conteste auprès de l'opérateur et on n'ouvre
// aucun dossier.
// ==========================================================================

import type { DisputeStatus } from '@prisma/client'
import { db } from './db'
import { audit, auditStandalone } from './audit'
import {
  DisputeError,
  assessConsumption,
  createDisputeWithFreeze,
  announceDispute,
} from './disputes'
import { releaseReservations, completeRefund } from './dispute-review'

export type ChargebackOutcome = 'LOST' | 'WON'

export interface ChargebackOpenResult {
  /** Un dossier a-t-il été ouvert ? */
  opened: boolean
  disputeId?: string
  /** Le chargeback a-t-il été écarté parce que l'achat était déjà remboursé ? */
  doubleDebitPrevented?: boolean
  reason?: string
}

/**
 * T1, source opérateur. Ouvre un dossier de litige à partir d'un chargeback.
 * Positionne `providerDisputeActive`, ce qui interdit à la modération de
 * rembourser en parallèle tant que l'opérateur n'a pas tranché.
 */
export async function openChargebackDispute(params: {
  providerTransactionId: string
  providerDisputeId: string
  source: 'STRIPE_CHARGEBACK' | 'CINETPAY_DISPUTE'
  amountFcfa?: number
}): Promise<ChargebackOpenResult> {
  const purchase = await db.purchase.findUnique({
    where: { providerTransactionId: params.providerTransactionId },
    select: {
      id: true, learnerId: true, trainerId: true, courseId: true, amountFcfa: true,
      refundedAt: true, providerStatus: true,
      course: { select: { id: true, title: true, format: true, durationSeconds: true } },
      disputes: {
        where: { status: { in: ['OPEN', 'IN_REVIEW', 'WAITING_LEARNER'] } },
        select: { id: true },
      },
    },
  })

  if (!purchase) {
    await auditStandalone({
      actorRole: 'SYSTEM',
      action: 'CHARGEBACK_PURCHASE_UNKNOWN',
      meta: { ...params },
    })
    return { opened: false, reason: 'PURCHASE_NOT_FOUND' }
  }

  // Décision 17 : l'argent a déjà été rendu à l'apprenant. Laisser le
  // chargeback aboutir le rembourserait une seconde fois, aux frais du
  // formateur. On marque le dossier pour que les preuves soient transmises à
  // l'opérateur, et on n'ouvre rien.
  if (purchase.refundedAt) {
    await auditStandalone({
      actorRole: 'SYSTEM',
      action: 'DOUBLE_DEBIT_PREVENTED',
      targetType: 'Purchase',
      targetId: purchase.id,
      meta: {
        ...params,
        refundedAt: purchase.refundedAt.toISOString(),
        note: "Remboursement déjà effectué : preuves à soumettre à l'opérateur.",
      },
    })
    await db.purchase.update({
      where: { id: purchase.id },
      data: { providerDisputeActive: true },
    })
    return { opened: false, doubleDebitPrevented: true, reason: 'ALREADY_REFUNDED' }
  }

  // Un dossier est déjà ouvert côté NkamVa : on l'attache au chargeback plutôt
  // que d'en créer un second sur le même achat.
  if (purchase.disputes.length > 0) {
    const existing = purchase.disputes[0]
    await db.$transaction(async (tx) => {
      await tx.dispute.update({
        where: { id: existing.id },
        data: { providerDisputeId: params.providerDisputeId },
      })
      await tx.purchase.update({
        where: { id: purchase.id },
        data: { providerDisputeActive: true },
      })
      await audit(tx, {
        actorRole: 'SYSTEM',
        action: 'CHARGEBACK_ATTACHED_TO_DISPUTE',
        targetType: 'Dispute',
        targetId: existing.id,
        meta: { ...params },
      })
    })
    return { opened: false, disputeId: existing.id, reason: 'DISPUTE_ALREADY_OPEN' }
  }

  if (!purchase.course || !purchase.courseId) {
    return { opened: false, reason: 'PURCHASE_NOT_ELIGIBLE' }
  }

  const view = await db.courseView.findUnique({
    where: { courseId_learnerId: { courseId: purchase.courseId, learnerId: purchase.learnerId } },
    select: { watchedSeconds: true, downloaded: true },
  })

  // Le constat de consommation est pris quand même : il ne conditionne pas
  // l'ouverture, mais la modération en a besoin pour instruire.
  const assessment = assessConsumption({
    format: purchase.course.format,
    durationSeconds: purchase.course.durationSeconds,
    watchedSeconds: view?.watchedSeconds ?? 0,
    downloaded: view?.downloaded ?? false,
  })

  const { id } = await createDisputeWithFreeze({
    purchaseId: purchase.id,
    learnerId: purchase.learnerId,
    trainerId: purchase.trainerId,
    courseId: purchase.courseId,
    amountFcfa: params.amountFcfa ?? purchase.amountFcfa,
    source: params.source,
    reason: 'UNAUTHORIZED_CHARGE',
    reasonDetail:
      "Contestation ouverte par l'opérateur de paiement à la demande de la banque de l'acheteur.",
    providerDisputeId: params.providerDisputeId,
    // Aucun auteur humain : le message d'ouverture est un message système.
    authorId: null,
    assessment,
  })

  await db.purchase.update({
    where: { id: purchase.id },
    data: { providerDisputeActive: true },
  })

  await announceDispute({
    disputeId: id,
    trainerId: purchase.trainerId,
    courseTitle: purchase.course.title,
    reason: 'UNAUTHORIZED_CHARGE',
  })

  return { opened: true, disputeId: id }
}

/**
 * T9 / T10. L'opérateur a tranché : le dossier se ferme dans le même sens.
 *
 * Perdu, la banque a déjà repris l'argent chez nous : le remboursement est un
 * fait acquis, pas une intention. On le marque donc COMPLETED sans passer par
 * une tâche manuelle — il n'y a plus rien à exécuter.
 */
export async function closeChargebackDispute(params: {
  providerDisputeId: string
  outcome: ChargebackOutcome
  providerRefundId?: string
}): Promise<{ closed: boolean; disputeId?: string; reason?: string }> {
  const dispute = await db.dispute.findFirst({
    where: { providerDisputeId: params.providerDisputeId },
    select: {
      id: true, status: true, purchaseId: true, disputedAmountFcfa: true,
    },
  })

  if (!dispute) {
    await auditStandalone({
      actorRole: 'SYSTEM',
      action: 'CHARGEBACK_DISPUTE_UNKNOWN',
      meta: { ...params },
    })
    return { closed: false, reason: 'DISPUTE_NOT_FOUND' }
  }

  const OPEN: DisputeStatus[] = ['OPEN', 'IN_REVIEW', 'WAITING_LEARNER']
  if (!OPEN.includes(dispute.status)) {
    // La modération a déjà tranché avant l'opérateur : on lève seulement le
    // drapeau, sans revenir sur une décision humaine.
    await db.purchase.update({
      where: { id: dispute.purchaseId },
      data: { providerDisputeActive: false },
    })
    await auditStandalone({
      actorRole: 'SYSTEM',
      action: 'CHARGEBACK_CLOSED_ON_RESOLVED_DISPUTE',
      targetType: 'Dispute',
      targetId: dispute.id,
      meta: { ...params, status: dispute.status },
    })
    return { closed: false, disputeId: dispute.id, reason: 'DISPUTE_ALREADY_RESOLVED' }
  }

  if (params.outcome === 'WON') {
    // T10 : l'opérateur nous a donné raison. Les fonds gelés reviennent au
    // formateur et l'accès de l'apprenant est rétabli.
    await db.$transaction(async (tx) => {
      const { count } = await tx.dispute.updateMany({
        where: { id: dispute.id, status: { in: OPEN } },
        data: {
          status: 'RESOLVED_REJECTED',
          resolution: 'REJECT',
          resolutionNote: "Contestation écartée par l'opérateur de paiement.",
          refundStatus: 'NOT_APPLICABLE',
          resolvedById: null,
          resolvedAt: new Date(),
          learnerDeadlineAt: null,
          lastActivityAt: new Date(),
        },
      })
      if (count === 0) return

      await releaseReservations(tx, dispute.id, null, 'CHARGEBACK_WON')
      await tx.purchase.update({
        where: { id: dispute.purchaseId },
        data: { accessSuspended: false, accessRestoredAt: new Date(), providerDisputeActive: false },
      })
      await tx.disputeReviewEvent.create({
        data: {
          disputeId: dispute.id,
          fromStatus: dispute.status as never,
          toStatus: 'RESOLVED_REJECTED',
          actorRole: 'SYSTEM',
          note: "Chargeback écarté par l'opérateur.",
        },
      })
      await audit(tx, {
        actorRole: 'SYSTEM',
        action: 'CHARGEBACK_WON',
        targetType: 'Dispute',
        targetId: dispute.id,
        meta: { ...params },
      })
    })
    return { closed: true, disputeId: dispute.id }
  }

  // T9 : l'opérateur a donné raison à l'acheteur. L'argent est déjà parti.
  await db.$transaction(async (tx) => {
    const { count } = await tx.dispute.updateMany({
      where: { id: dispute.id, status: { in: OPEN } },
      data: {
        status: 'RESOLVED_REFUNDED',
        resolution: 'FULL_REFUND',
        resolutionNote: "Contestation retenue par l'opérateur de paiement.",
        refundStatus: 'PENDING',
        resolvedById: null,
        resolvedAt: new Date(),
        learnerDeadlineAt: null,
        lastActivityAt: new Date(),
      },
    })
    if (count === 0) return

    await tx.purchase.update({
      where: { id: dispute.purchaseId },
      data: { providerDisputeActive: false },
    })
    await tx.disputeReviewEvent.create({
      data: {
        disputeId: dispute.id,
        fromStatus: dispute.status as never,
        toStatus: 'RESOLVED_REFUNDED',
        actorRole: 'SYSTEM',
        note: "Chargeback retenu par l'opérateur.",
      },
    })
    await audit(tx, {
      actorRole: 'SYSTEM',
      action: 'CHARGEBACK_LOST',
      targetType: 'Dispute',
      targetId: dispute.id,
      meta: { ...params },
    })
  })

  // Le débit suit immédiatement : contrairement à une décision de la
  // modération, il n'y a pas de remboursement à exécuter — il a déjà eu lieu.
  await completeRefund(dispute.id, null, {
    refundAmountFcfa: dispute.disputedAmountFcfa,
    providerRefundId: params.providerRefundId,
  })

  return { closed: true, disputeId: dispute.id }
}

export { DisputeError }
