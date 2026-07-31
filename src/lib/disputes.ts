// ==========================================================================
// Lot 2 — Litiges & chargebacks : Dispute (T1-T10) + FundReservation (FR1-FR5)
// ==========================================================================

import { db } from './db'
import { audit, auditStandalone } from './audit'
import { notify, notifyAdminSubRole } from './notification'
import { sendEmail } from './email'
import { presignUpload } from './s3'
import { getStripe } from './stripe'
import type { DisputeReason, DisputeStatus } from '@prisma/client'

export const LEARNER_RESPONSE_DEADLINE_DAYS = 7
export const DISPUTE_MESSAGE_MAX_LENGTH = 5000
export const TRAINER_SHARE_RATE = 0.85
const CONSUMPTION_THRESHOLD_PERCENT = 30
const REFUND_DEADLINE_DAYS = 14

export const DISPUTE_ERRORS: Record<string, { status: number; message: string }> = {
  PURCHASE_NOT_FOUND: { status: 404, message: 'Achat introuvable' },
  FORBIDDEN: { status: 403, message: 'Accès refusé' },
  PURCHASE_NOT_ELIGIBLE: { status: 422, message: 'Achat non éligible au litige' },
  DISPUTE_ALREADY_ACTIVE: { status: 409, message: 'Un litige est déjà en cours sur cet achat' },
  REFUND_DEADLINE_EXPIRED: { status: 422, message: 'Délai de 14 jours dépassé' },
  RESOURCE_DOWNLOADED: { status: 403, message: 'Ressource déjà téléchargée' },
  CONSUMPTION_THRESHOLD_EXCEEDED: { status: 422, message: 'Ressource consommée à plus de 30 %' },
  WALLET_NOT_FOUND: { status: 404, message: 'Wallet formateur introuvable' },
  DISPUTE_NOT_FOUND: { status: 404, message: 'Litige introuvable' },
  MESSAGE_TOO_LONG: { status: 400, message: `Message limité à ${DISPUTE_MESSAGE_MAX_LENGTH} caractères` },
  DISPUTE_CLOSED: { status: 409, message: 'Litige déjà résolu' },
  STALE_DISPUTE: { status: 409, message: 'Litige modifié par un autre admin' },
  INVALID_DISPUTE_STATUS: { status: 409, message: 'Statut de litige invalide pour cette action' },
  INVALID_REFUND_AMOUNT: { status: 400, message: 'Montant de remboursement invalide' },
  REFUND_POLICY_VIOLATION: { status: 422, message: 'Remboursement intégral hors politique (14j/30%) — policyOverride requis' },
  PROVIDER_DISPUTE_ACTIVE: { status: 409, message: 'Un chargeback provider est actif sur cet achat' },
  OVERRIDE_JUSTIFICATION_REQUIRED: { status: 400, message: 'Justification requise pour un policyOverride' },
  SUPPORT_TICKET_EXISTS: { status: 409, message: 'Contestation déjà déposée' },
  MIME_NOT_ALLOWED: { status: 400, message: 'Type de fichier non autorisé' },
  SIZE_EXCEEDS_LIMIT: { status: 400, message: 'Taille du fichier dépassée' },
}

const ACTIVE_STATUSES: DisputeStatus[] = ['OPEN', 'IN_REVIEW', 'WAITING_LEARNER']

// --- ConsumptionSnapshot (figé à l'ouverture) ---

async function computeConsumptionSnapshot(purchase: { courseId: string | null; learnerId: string }) {
  if (!purchase.courseId) return null
  const course = await db.course.findUnique({ where: { id: purchase.courseId }, select: { format: true, durationSeconds: true } })
  if (!course) return null
  const view = await db.courseView.findUnique({ where: { courseId_learnerId: { courseId: purchase.courseId, learnerId: purchase.learnerId } } })
  const ruleApplies = course.format === 'video'
  const downloaded = view?.downloaded ?? false
  let consumptionPercent = 0
  if (ruleApplies && course.durationSeconds) consumptionPercent = Math.min(100, Math.round(((view?.watchedSeconds || 0) / course.durationSeconds) * 100))
  else if (downloaded) consumptionPercent = 100
  return {
    courseId: purchase.courseId, courseFormat: course.format,
    watchedSeconds: view?.watchedSeconds ?? null, courseDurationSeconds: course.durationSeconds ?? null,
    downloaded, consumptionPercent, ruleApplies,
  }
}

// --- T1 (LEARNER_REQUEST) : ouvrir un litige ---

export async function openDispute(learnerId: string, purchaseId: string, reason: DisputeReason, reasonDetail?: string) {
  const purchase = await db.purchase.findUnique({ where: { id: purchaseId } })
  if (!purchase) throw new Error('PURCHASE_NOT_FOUND')
  if (purchase.learnerId !== learnerId) throw new Error('FORBIDDEN')
  if (purchase.providerStatus !== 'SUCCEEDED') throw new Error('PURCHASE_NOT_ELIGIBLE')

  const active = await db.dispute.findFirst({ where: { purchaseId, status: { in: ACTIVE_STATUSES } } })
  if (active) throw new Error('DISPUTE_ALREADY_ACTIVE')

  const now = new Date()
  if (purchase.createdAt < new Date(now.getTime() - REFUND_DEADLINE_DAYS * 86400000)) throw new Error('REFUND_DEADLINE_EXPIRED')

  const snapshot = await computeConsumptionSnapshot(purchase)
  if (snapshot?.downloaded) throw new Error('RESOURCE_DOWNLOADED')
  if (snapshot?.ruleApplies && snapshot.consumptionPercent >= CONSUMPTION_THRESHOLD_PERCENT) throw new Error('CONSUMPTION_THRESHOLD_EXCEEDED')

  const disputedAmountFcfa = purchase.amountFcfa
  const reservedAmountFcfa = Math.round(disputedAmountFcfa * TRAINER_SHARE_RATE)

  const dispute = await db.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { trainerId: purchase.trainerId } })
    if (!wallet) throw new Error('WALLET_NOT_FOUND')

    const d = await tx.dispute.create({
      data: { purchaseId, learnerId, trainerId: purchase.trainerId, source: 'LEARNER_REQUEST', reason, reasonDetail, disputedAmountFcfa },
    })
    if (snapshot) await tx.consumptionSnapshot.create({ data: { disputeId: d.id, ...snapshot } })
    await tx.purchase.update({ where: { id: purchaseId }, data: { accessSuspended: true, accessSuspendedAt: now } })
    await tx.fundReservation.create({ data: { disputeId: d.id, walletId: wallet.id, reservedAmountFcfa, status: 'ACTIVE' } })
    await tx.wallet.update({ where: { id: wallet.id }, data: { reservedBalance: { increment: reservedAmountFcfa } } })
    await audit(tx, { actorId: learnerId, actorRole: 'LEARNER', action: 'DISPUTE_OPENED', targetType: 'Dispute', targetId: d.id, meta: { purchaseId, reservedAmountFcfa } })
    return d
  })

  const trainerProfile = await db.trainerProfile.findUnique({ where: { id: purchase.trainerId }, include: { user: { select: { id: true, email: true } } } })
  if (trainerProfile) {
    await sendEmail({ to: trainerProfile.user.email, subject: 'Un litige a été ouvert sur une de vos ventes', html: `<p>Un apprenant a ouvert un litige. Vous pouvez le contester depuis votre espace formateur.</p>` })
    await notify(trainerProfile.user.id, { type: 'DISPUTE_OPENED', title: 'Litige ouvert', body: 'Un apprenant a ouvert un litige sur une de vos ventes.', link: `/formateur/litiges/${dispute.id}` })
  }
  return dispute
}

// --- T1 (STRIPE_CHARGEBACK, webhook charge.dispute.created) ---

export async function openDisputeFromChargeback(paymentIntentId: string, providerDisputeId: string): Promise<void> {
  const purchase = await db.purchase.findUnique({ where: { providerTransactionId: paymentIntentId } })
  if (!purchase) { await auditStandalone({ action: 'STRIPE_CHARGEBACK_UNKNOWN_PURCHASE', meta: { paymentIntentId, providerDisputeId } }); return }

  if (purchase.refundedAt) {
    // §5 : prévention du double débit — déjà remboursé côté nous, on conteste auprès de Stripe
    const stripe = getStripe()
    if (stripe) { try { await stripe.disputes.update(providerDisputeId, { submit: true } as any) } catch { /* best effort */ } }
    await db.purchase.update({ where: { id: purchase.id }, data: { providerDisputeActive: true } })
    await auditStandalone({ action: 'DOUBLE_DEBIT_PREVENTED', targetType: 'Purchase', targetId: purchase.id, meta: { providerDisputeId } })
    await notifyAdminSubRole('FINANCES', { type: 'DOUBLE_DEBIT_PREVENTED', title: 'Double débit évité', body: `Chargeback Stripe reçu sur un achat déjà remboursé (${purchase.id}).` })
    return
  }

  const disputedAmountFcfa = purchase.amountFcfa
  const reservedAmountFcfa = Math.round(disputedAmountFcfa * TRAINER_SHARE_RATE)

  await db.$transaction(async (tx) => {
    const d = await tx.dispute.create({
      data: { purchaseId: purchase.id, learnerId: purchase.learnerId, trainerId: purchase.trainerId, source: 'STRIPE_CHARGEBACK', reason: 'UNAUTHORIZED_CHARGE', disputedAmountFcfa, providerDisputeId },
    })
    await tx.purchase.update({ where: { id: purchase.id }, data: { accessSuspended: true, accessSuspendedAt: new Date(), providerDisputeActive: true } })
    const wallet = await tx.wallet.findUnique({ where: { trainerId: purchase.trainerId } })
    if (wallet) {
      await tx.fundReservation.create({ data: { disputeId: d.id, walletId: wallet.id, reservedAmountFcfa, status: 'ACTIVE' } })
      await tx.wallet.update({ where: { id: wallet.id }, data: { reservedBalance: { increment: reservedAmountFcfa } } })
    }
    await audit(tx, { action: 'DISPUTE_OPENED_FROM_CHARGEBACK', targetType: 'Dispute', targetId: d.id, meta: { purchaseId: purchase.id, providerDisputeId } })
  })
}

// --- Listes / détail / stats ---

export async function listMyDisputes(learnerId: string, page = 1, pageSize = 20) {
  const [items, total] = await Promise.all([
    db.dispute.findMany({ where: { learnerId }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    db.dispute.count({ where: { learnerId } }),
  ])
  return { items, total, page, pageSize }
}

// Formateur : reason (enum) uniquement, jamais reasonDetail (visible apprenant + Modération seulement)
export async function listTrainerDisputes(trainerProfileId: string, page = 1, pageSize = 20) {
  const [items, total] = await Promise.all([
    db.dispute.findMany({
      where: { trainerId: trainerProfileId },
      select: { id: true, purchaseId: true, source: true, reason: true, status: true, disputedAmountFcfa: true, openedAt: true, lastActivityAt: true },
      orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
    }),
    db.dispute.count({ where: { trainerId: trainerProfileId } }),
  ])
  return { items, total, page, pageSize }
}

export async function listAdminDisputes(queue: 'open' | 'resolved', page = 1, pageSize = 20) {
  const status = queue === 'open' ? { in: ACTIVE_STATUSES } : { in: ['RESOLVED_REFUNDED', 'RESOLVED_REJECTED', 'RESOLVED_AUTO'] as DisputeStatus[] }
  const [items, total] = await Promise.all([
    db.dispute.findMany({ where: { status }, orderBy: { lastActivityAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    db.dispute.count({ where: { status } }),
  ])
  return { items, total, page, pageSize }
}

export async function getDisputeStats() {
  const [open, resolvedRefunded, resolvedRejected, resolvedAuto] = await Promise.all([
    db.dispute.count({ where: { status: { in: ACTIVE_STATUSES } } }),
    db.dispute.count({ where: { status: 'RESOLVED_REFUNDED' } }),
    db.dispute.count({ where: { status: 'RESOLVED_REJECTED' } }),
    db.dispute.count({ where: { status: 'RESOLVED_AUTO' } }),
  ])
  return { open, resolvedRefunded, resolvedRejected, resolvedAuto }
}

export async function getDisputeDetail(disputeId: string) {
  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    include: { messages: { orderBy: { createdAt: 'asc' } }, fundReservations: true, consumptionSnapshot: true, purchase: true },
  })
  if (!dispute) throw new Error('DISPUTE_NOT_FOUND')
  return dispute
}

// --- Messagerie (T2, T4) ---

export async function addSupportMessage(disputeId: string, adminId: string, body: string): Promise<void> {
  if (body.length > DISPUTE_MESSAGE_MAX_LENGTH) throw new Error('MESSAGE_TOO_LONG')
  const dispute = await db.dispute.findUnique({ where: { id: disputeId } })
  if (!dispute) throw new Error('DISPUTE_NOT_FOUND')
  if (!ACTIVE_STATUSES.includes(dispute.status)) throw new Error('DISPUTE_CLOSED')

  await db.$transaction(async (tx) => {
    await tx.disputeMessage.create({ data: { disputeId, authorId: adminId, authorRole: 'SUPPORT', body, readByLearner: false } })
    if (dispute.status === 'OPEN') {
      await tx.dispute.update({ where: { id: disputeId }, data: { status: 'IN_REVIEW', lastActivityAt: new Date() } })
      await tx.disputeReviewEvent.create({ data: { disputeId, fromStatus: 'OPEN', toStatus: 'IN_REVIEW', actorId: adminId, actorRole: 'MODERATION' } })
    } else {
      await tx.dispute.update({ where: { id: disputeId }, data: { lastActivityAt: new Date() } })
    }
  })
  await notify(dispute.learnerId, { type: 'DISPUTE_MESSAGE', title: 'Nouveau message sur votre litige', body: body.slice(0, 140), link: `/mes-litiges/${disputeId}` })
}

export async function addLearnerMessage(disputeId: string, learnerId: string, body: string): Promise<void> {
  if (body.length > DISPUTE_MESSAGE_MAX_LENGTH) throw new Error('MESSAGE_TOO_LONG')
  const dispute = await db.dispute.findUnique({ where: { id: disputeId } })
  if (!dispute) throw new Error('DISPUTE_NOT_FOUND')
  if (dispute.learnerId !== learnerId) throw new Error('FORBIDDEN')
  if (!ACTIVE_STATUSES.includes(dispute.status)) throw new Error('DISPUTE_CLOSED')

  const wasWaiting = dispute.status === 'WAITING_LEARNER'
  await db.$transaction(async (tx) => {
    await tx.disputeMessage.create({ data: { disputeId, authorId: learnerId, authorRole: 'LEARNER', body, readBySupport: false } })
    await tx.dispute.update({ where: { id: disputeId }, data: { lastActivityAt: new Date(), ...(wasWaiting ? { status: 'IN_REVIEW', learnerDeadlineAt: null } : {}) } })
    if (wasWaiting) await tx.disputeReviewEvent.create({ data: { disputeId, fromStatus: 'WAITING_LEARNER', toStatus: 'IN_REVIEW', actorId: learnerId, actorRole: 'LEARNER' } })
  })
  await notifyAdminSubRole('MODERATION', { type: 'DISPUTE_MESSAGE', title: 'Réponse apprenant sur un litige', body: body.slice(0, 140), link: `/admin/litiges/${disputeId}` })
}

// --- T3/T5 : demander une info à l'apprenant ---

export async function askLearner(disputeId: string, adminId: string, expectedUpdatedAt: Date, question: string): Promise<void> {
  const res = await db.dispute.updateMany({
    where: { id: disputeId, updatedAt: expectedUpdatedAt, status: 'IN_REVIEW' },
    data: { status: 'WAITING_LEARNER', learnerDeadlineAt: new Date(Date.now() + LEARNER_RESPONSE_DEADLINE_DAYS * 86400000) },
  })
  if (res.count === 0) throw new Error('STALE_DISPUTE')

  const dispute = await db.dispute.findUniqueOrThrow({ where: { id: disputeId } })
  await db.disputeMessage.create({ data: { disputeId, authorRole: 'SYSTEM', body: question, readByLearner: false } })
  await db.disputeReviewEvent.create({ data: { disputeId, fromStatus: 'IN_REVIEW', toStatus: 'WAITING_LEARNER', actorId: adminId, actorRole: 'MODERATION' } })

  const user = await db.user.findUnique({ where: { id: dispute.learnerId }, select: { email: true } })
  if (user) await sendEmail({ to: user.email, subject: 'Information complémentaire requise pour votre litige', html: `<p>${question}</p>` })
  await notify(dispute.learnerId, { type: 'DISPUTE_INFO_REQUESTED', title: 'Information requise', body: question, link: `/mes-litiges/${disputeId}` })
}

// --- Effets partagés T7/T8/T10 (rejet / timeout / chargeback gagné) ---

async function releaseReservation(
  disputeId: string, toStatus: DisputeStatus, resolution: 'REJECT' | 'AUTO_TIMEOUT',
  actorId: string | null, actorRole: string,
): Promise<void> {
  const dispute = await db.dispute.findUnique({ where: { id: disputeId }, include: { fundReservations: true } })
  if (!dispute) throw new Error('DISPUTE_NOT_FOUND')

  await db.$transaction(async (tx) => {
    const res = await tx.dispute.updateMany({
      where: { id: disputeId, status: { in: ACTIVE_STATUSES } },
      data: { status: toStatus, resolution, refundStatus: 'NOT_APPLICABLE', resolvedById: actorId, resolvedAt: new Date() },
    })
    if (res.count === 0) return // déjà résolu (idempotent)

    const reservation = dispute.fundReservations.find(r => r.status === 'ACTIVE')
    if (reservation) {
      await tx.fundReservation.update({ where: { id: reservation.id }, data: { status: 'RELEASED', releasedAt: new Date(), releasedById: actorId, releaseReason: resolution } })
      await tx.wallet.update({ where: { id: reservation.walletId }, data: { reservedBalance: { decrement: reservation.reservedAmountFcfa } } })
    }
    await tx.purchase.update({ where: { id: dispute.purchaseId }, data: { accessSuspended: false, accessRestoredAt: new Date(), providerDisputeActive: false } })
    await tx.disputeReviewEvent.create({ data: { disputeId, fromStatus: dispute.status, toStatus, actorId, actorRole } })
    await audit(tx, { actorId, actorRole, action: `DISPUTE_${resolution}`, targetType: 'Dispute', targetId: disputeId, meta: {} })
  })

  await notify(dispute.learnerId, { type: 'DISPUTE_RESOLVED', title: 'Litige rejeté, accès rétabli', body: 'Votre accès à la ressource a été rétabli.' })
}

// --- T7 : rejet (Modération) ---

export async function rejectDispute(disputeId: string, adminId: string, expectedUpdatedAt: Date): Promise<void> {
  const dispute = await db.dispute.findUnique({ where: { id: disputeId } })
  if (!dispute) throw new Error('DISPUTE_NOT_FOUND')
  if (dispute.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw new Error('STALE_DISPUTE')
  if (!ACTIVE_STATUSES.includes(dispute.status)) throw new Error('INVALID_DISPUTE_STATUS')
  await releaseReservation(disputeId, 'RESOLVED_REJECTED', 'REJECT', adminId, 'MODERATION')
}

// --- T8 : auto-timeout (job horaire) ---

export async function autoTimeoutDisputes(): Promise<number> {
  const expired = await db.dispute.findMany({ where: { status: 'WAITING_LEARNER', learnerDeadlineAt: { lt: new Date() } } })
  for (const d of expired) await releaseReservation(d.id, 'RESOLVED_AUTO', 'AUTO_TIMEOUT', null, 'SYSTEM')
  return expired.length
}

// --- T6 : remboursement (Modération / Super-admin si policyOverride) ---

function withinRefundPolicy(purchaseCreatedAt: Date, openedAt: Date, snapshot: { consumptionPercent: number; ruleApplies: boolean; downloaded: boolean | null } | null): boolean {
  if (openedAt.getTime() - purchaseCreatedAt.getTime() > REFUND_DEADLINE_DAYS * 86400000) return false
  if (!snapshot) return true // pas de cours rattaché (ex. abonnement communauté) : seule la règle des 14j s'applique ici
  if (snapshot.downloaded) return false
  if (snapshot.ruleApplies && snapshot.consumptionPercent >= CONSUMPTION_THRESHOLD_PERCENT) return false
  return true
}

export interface ResolveOptions {
  resolutionType: 'FULL_REFUND' | 'PARTIAL_REFUND'
  partialAmountFcfa?: number
  note?: string
  policyOverride?: boolean
  overrideJustification?: string
  isSuperAdmin?: boolean
}

export async function resolveDisputeWithRefund(disputeId: string, adminId: string, expectedUpdatedAt: Date, opts: ResolveOptions): Promise<void> {
  const dispute = await db.dispute.findUnique({
    where: { id: disputeId }, include: { purchase: true, consumptionSnapshot: true },
  })
  if (!dispute) throw new Error('DISPUTE_NOT_FOUND')
  if (dispute.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw new Error('STALE_DISPUTE')
  if (!ACTIVE_STATUSES.includes(dispute.status)) throw new Error('INVALID_DISPUTE_STATUS')
  if (dispute.purchase.providerDisputeActive) throw new Error('PROVIDER_DISPUTE_ACTIVE')

  if (opts.resolutionType === 'FULL_REFUND' && !opts.policyOverride) {
    if (!withinRefundPolicy(dispute.purchase.createdAt, dispute.openedAt, dispute.consumptionSnapshot)) throw new Error('REFUND_POLICY_VIOLATION')
  }
  if (opts.policyOverride) {
    if (!opts.isSuperAdmin) throw new Error('FORBIDDEN')
    if (!opts.overrideJustification) throw new Error('OVERRIDE_JUSTIFICATION_REQUIRED')
  }

  const refundAmountFcfa = opts.resolutionType === 'FULL_REFUND' ? dispute.purchase.amountFcfa : (opts.partialAmountFcfa ?? 0)
  if (opts.resolutionType === 'PARTIAL_REFUND' && (refundAmountFcfa <= 0 || refundAmountFcfa >= dispute.purchase.amountFcfa)) throw new Error('INVALID_REFUND_AMOUNT')

  await db.dispute.update({
    where: { id: disputeId },
    data: {
      status: 'RESOLVED_REFUNDED', resolution: opts.resolutionType, resolutionNote: opts.note,
      overrideJustification: opts.policyOverride ? opts.overrideJustification : null,
      resolvedById: adminId, resolvedAt: new Date(), refundStatus: 'PENDING',
    },
  })
  await db.disputeReviewEvent.create({ data: { disputeId, fromStatus: dispute.status, toStatus: 'RESOLVED_REFUNDED', actorId: adminId, actorRole: 'MODERATION' } })
  if (opts.policyOverride) await auditStandalone({ actorId: adminId, actorRole: 'SUPER_ADMIN', action: 'DISPUTE_REFUND_POLICY_BYPASSED', targetType: 'Dispute', targetId: disputeId, meta: { justification: opts.overrideJustification } })

  if (dispute.purchase.provider === 'STRIPE') {
    const stripe = getStripe()
    let providerRefundId = `re_dev_${crypto.randomUUID()}`
    if (stripe && process.env.STRIPE_SECRET_KEY) {
      try {
        const refund = await stripe.refunds.create({ payment_intent: dispute.purchase.providerTransactionId!, amount: refundAmountFcfa })
        providerRefundId = refund.id
      } catch (err) {
        await auditStandalone({ action: 'DISPUTE_REFUND_FAILED', targetType: 'Dispute', targetId: disputeId, meta: { error: String(err) } })
        return // refundStatus reste PENDING, à réessayer
      }
    }
    await completeRefund(disputeId, refundAmountFcfa, providerRefundId, adminId)
  } else {
    // CinetPay : pas de refund API fiable en synchrone → tâche manuelle Finances
    const trainerDebitFcfa = Math.round(refundAmountFcfa * TRAINER_SHARE_RATE)
    await db.manualRefundTask.create({ data: { disputeId, provider: 'CINETPAY', refundAmountFcfa, trainerDebitFcfa, status: 'PENDING' } })
    await notifyAdminSubRole('FINANCES', { type: 'MANUAL_REFUND_TASK_CREATED', title: 'Remboursement CinetPay à traiter', body: `Litige ${disputeId}`, link: `/admin/remboursements-manuels` })
  }
}

// --- Application effective du remboursement (FR3/FR4), idempotente ---

export async function completeRefund(disputeId: string, refundAmountFcfa: number, providerRefundId: string | null, actorId: string | null): Promise<void> {
  await db.$transaction(async (tx) => {
    const dispute = await tx.dispute.findUnique({ where: { id: disputeId }, include: { fundReservations: true } })
    if (!dispute) throw new Error('DISPUTE_NOT_FOUND')

    // Idempotence : la transition refundStatus PENDING → COMPLETED n'a lieu qu'une fois
    const res = await tx.dispute.updateMany({
      where: { id: disputeId, refundStatus: 'PENDING' },
      data: { refundStatus: 'COMPLETED', refundProcessedAt: new Date(), providerRefundId },
    })
    if (res.count === 0) return

    const reservation = dispute.fundReservations.find(r => r.status === 'ACTIVE')
    if (reservation) {
      if (dispute.resolution === 'FULL_REFUND') {
        await tx.fundReservation.update({ where: { id: reservation.id }, data: { status: 'DEBITED', debitedAmount: reservation.reservedAmountFcfa } })
        await tx.wallet.update({ where: { id: reservation.walletId }, data: { reservedBalance: { decrement: reservation.reservedAmountFcfa }, balance: { decrement: reservation.reservedAmountFcfa } } })
      } else {
        const debitedAmount = Math.round(refundAmountFcfa * TRAINER_SHARE_RATE)
        const releasedAmount = reservation.reservedAmountFcfa - debitedAmount
        await tx.fundReservation.update({ where: { id: reservation.id }, data: { status: 'PARTIALLY_DEBITED', debitedAmount, releasedAmount } })
        await tx.wallet.update({ where: { id: reservation.walletId }, data: { reservedBalance: { decrement: reservation.reservedAmountFcfa }, balance: { decrement: debitedAmount } } })
      }
    }

    await tx.purchase.update({ where: { id: dispute.purchaseId }, data: { refundedAt: new Date(), refundAmountFcfa, providerRefundId } })
    await audit(tx, { actorId, action: 'DISPUTE_REFUND_COMPLETED', targetType: 'Dispute', targetId: disputeId, meta: { refundAmountFcfa, resolution: dispute.resolution } })
  })
}

// --- T9/T10 : webhook Stripe charge.dispute.closed ---

export async function closeDisputeFromChargeback(providerDisputeId: string, won: boolean): Promise<void> {
  const dispute = await db.dispute.findFirst({ where: { providerDisputeId } })
  if (!dispute) return

  if (won) {
    await releaseReservation(dispute.id, 'RESOLVED_REJECTED', 'REJECT', null, 'SYSTEM') // T10
    return
  }
  // T9 : chargeback perdu — Stripe a déjà débité, on aligne notre comptabilité
  const res = await db.dispute.updateMany({ where: { id: dispute.id, status: { in: ACTIVE_STATUSES } }, data: { status: 'RESOLVED_REFUNDED', resolution: 'FULL_REFUND', refundStatus: 'PENDING', resolvedById: null, resolvedAt: new Date() } })
  if (res.count === 0) return
  await db.disputeReviewEvent.create({ data: { disputeId: dispute.id, fromStatus: dispute.status, toStatus: 'RESOLVED_REFUNDED', actorId: null, actorRole: 'SYSTEM' } })
  await completeRefund(dispute.id, dispute.disputedAmountFcfa, providerDisputeId, null)
}

// --- Formateur : contester (crée un SupportTicket) ---

export async function contestDispute(disputeId: string, trainerUserId: string, reason: string, attachments: string[] = []) {
  const dispute = await db.dispute.findUnique({ where: { id: disputeId } })
  if (!dispute) throw new Error('DISPUTE_NOT_FOUND')

  const existing = await db.supportTicket.findFirst({ where: { disputeId, trainerId: trainerUserId } })
  if (existing) throw new Error('SUPPORT_TICKET_EXISTS')

  const ticket = await db.supportTicket.create({ data: { disputeId, trainerId: trainerUserId, reason, attachments } })
  await notifyAdminSubRole('MODERATION', { type: 'DISPUTE_CONTESTED', title: 'Litige contesté par le formateur', body: reason.slice(0, 140), link: `/admin/litiges/${disputeId}` })
  await auditStandalone({ actorId: trainerUserId, actorRole: 'TRAINER', action: 'DISPUTE_CONTESTED', targetType: 'SupportTicket', targetId: ticket.id, meta: { disputeId } })
  return ticket
}

// --- Pièces jointes (apprenant) ---

const ATTACHMENT_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
const ATTACHMENT_MAX_SIZE = 10_485_760

export async function presignDisputeAttachmentUpload(learnerId: string, mimeType: string, sizeBytes: number) {
  if (!ATTACHMENT_MIMES.includes(mimeType)) throw new Error('MIME_NOT_ALLOWED')
  if (sizeBytes > ATTACHMENT_MAX_SIZE) throw new Error('SIZE_EXCEEDS_LIMIT')

  const s3Key = `dispute-attachments/${learnerId}/${crypto.randomUUID()}`
  const pending = await db.pendingAttachment.create({
    data: { s3Key, issuerId: learnerId, scope: 'DISPUTE_ATTACHMENT', mimeType, sizeBytes, sha256: '', status: 'PENDING', expiresAt: new Date(Date.now() + 3600000) },
  })
  const { uploadUrl, expiresAt } = await presignUpload(s3Key, mimeType, sizeBytes)
  return { attachmentId: pending.id, uploadUrl, expiresAt, s3Key }
}
