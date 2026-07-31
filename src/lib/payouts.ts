// ==========================================================================
// Lot 3 — Payout (retrait formateur) : P1-P8
// ==========================================================================

import { db } from './db'
import { audit, auditStandalone } from './audit'
import { notifyAdminSubRole, notify } from './notification'
import { computeKycScore, KYC_THRESHOLD_VERIFIED } from './kyc'
import type { PrismaTransaction } from './types'

export const PAYOUT_MIN_AMOUNT_FCFA = 10000
export const PAYOUT_REVIEW_SLA_HOURS = 48

export const PAYOUT_ERRORS: Record<string, { status: number; message: string }> = {
  AMOUNT_TOO_LOW: { status: 400, message: `Montant minimum ${PAYOUT_MIN_AMOUNT_FCFA} FCFA` },
  WALLET_NOT_FOUND: { status: 404, message: 'Wallet introuvable' },
  INSUFFICIENT_WITHDRAWABLE_BALANCE: { status: 422, message: 'Solde retirable insuffisant' },
  PAYOUT_METHOD_NOT_VERIFIED: { status: 422, message: 'Aucun moyen de paiement vérifié' },
  PAYOUT_METHOD_IN_CARENCE: { status: 422, message: 'Moyen de paiement en carence' },
  PAYOUT_IN_PROGRESS: { status: 409, message: 'Un retrait est déjà en cours' },
  PAYOUT_NOT_FOUND: { status: 404, message: 'Retrait introuvable' },
  FORBIDDEN: { status: 403, message: 'Accès refusé' },
  INVALID_PAYOUT_STATUS: { status: 409, message: 'Statut de retrait invalide pour cette action' },
  STALE_PAYOUT: { status: 409, message: 'Retrait modifié par un autre admin' },
}

async function syncNegativeSince(tx: PrismaTransaction, walletId: string): Promise<void> {
  const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: walletId } })
  const withdrawable = wallet.balance - wallet.reservedBalance - wallet.pendingPayoutBalance
  if (withdrawable < 0 && !wallet.negativeSince) await tx.wallet.update({ where: { id: walletId }, data: { negativeSince: new Date() } })
  else if (withdrawable >= 0 && wallet.negativeSince) await tx.wallet.update({ where: { id: walletId }, data: { negativeSince: null } })
}

// --- P1 : demander un retrait ---

export async function requestPayout(trainerId: string, userId: string, amountFcfa: number) {
  if (amountFcfa < PAYOUT_MIN_AMOUNT_FCFA) throw new Error('AMOUNT_TOO_LOW')

  const wallet = await db.wallet.findUnique({ where: { trainerId } })
  if (!wallet) throw new Error('WALLET_NOT_FOUND')
  const withdrawable = wallet.balance - wallet.reservedBalance - wallet.pendingPayoutBalance
  if (amountFcfa > withdrawable) throw new Error('INSUFFICIENT_WITHDRAWABLE_BALANCE')

  const activeMethod = await db.payoutMethod.findFirst({ where: { trainerId, isActive: true } })
  if (!activeMethod || activeMethod.verificationStatus !== 'VERIFIED') throw new Error('PAYOUT_METHOD_NOT_VERIFIED')
  if (activeMethod.carenceUntil && activeMethod.carenceUntil > new Date()) throw new Error('PAYOUT_METHOD_IN_CARENCE')

  const activePayout = await db.payout.findFirst({ where: { trainerId, status: { in: ['PENDING', 'AUTO_APPROVED', 'IN_REVIEW', 'APPROVED'] } } })
  if (activePayout) throw new Error('PAYOUT_IN_PROGRESS')

  const kyc = await computeKycScore(trainerId)
  const willAutoApprove = kyc.score >= KYC_THRESHOLD_VERIFIED && !kyc.firstPayout && !kyc.carenceActive
  const targetStatus = willAutoApprove ? 'AUTO_APPROVED' : 'IN_REVIEW'

  const payout = await db.$transaction(async (tx) => {
    const p = await tx.payout.create({
      data: {
        trainerId, payoutMethodId: activeMethod.id, amountFcfa, status: targetStatus,
        kycScoreSnapshot: kyc.score, kycBadgeSnapshot: kyc.badge, kycCriteriaSnapshot: kyc.criteria as any,
        isFirstPayout: kyc.firstPayout, carenceHolds: kyc.carenceActive,
        ...(willAutoApprove ? { wireInitiatedAt: new Date() } : {}),
      },
    })
    if (willAutoApprove) await tx.payout.update({ where: { id: p.id }, data: { idempotencyKey: `payout:${p.id}` } })
    await tx.wallet.update({ where: { id: wallet.id }, data: { pendingPayoutBalance: { increment: amountFcfa } } })
    await tx.payoutReviewEvent.create({ data: { payoutId: p.id, fromStatus: 'PENDING', toStatus: targetStatus, actorId: userId, actorRole: 'TRAINER' } })
    await audit(tx, { actorId: userId, actorRole: 'TRAINER', action: 'PAYOUT_REQUESTED', targetType: 'Payout', targetId: p.id, meta: { amountFcfa, autoApproved: willAutoApprove } })
    return p
  })

  await notifyAdminSubRole('FINANCES', {
    type: willAutoApprove ? 'PAYOUT_AUTO_APPROVED' : 'PAYOUT_PENDING_REVIEW',
    title: willAutoApprove ? 'Retrait auto-approuvé' : 'Nouveau retrait à valider',
    body: `${amountFcfa} FCFA`, link: `/admin/payouts/${payout.id}`,
  })
  return payout
}

// --- Listes / détail ---

export async function listTrainerPayouts(trainerId: string, page = 1, pageSize = 20) {
  const [items, total] = await Promise.all([
    db.payout.findMany({ where: { trainerId }, orderBy: { submittedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    db.payout.count({ where: { trainerId } }),
  ])
  return { items, total, page, pageSize }
}

export async function getPayoutDetail(payoutId: string) {
  const payout = await db.payout.findUnique({ where: { id: payoutId }, include: { payoutMethod: true, reviewEvents: { orderBy: { createdAt: 'asc' } } } })
  if (!payout) throw new Error('PAYOUT_NOT_FOUND')
  return payout
}

export async function listAdminPayouts(status?: 'IN_REVIEW' | 'AUTO_APPROVED' | 'APPROVED' | 'PAID' | 'REJECTED' | 'FAILED', page = 1, pageSize = 20) {
  const where = status ? { status } : {}
  const [items, total] = await Promise.all([
    db.payout.findMany({ where, orderBy: { submittedAt: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
    db.payout.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function getPayoutStats() {
  const [pending, autoApproved, paidThisMonth, failed] = await Promise.all([
    db.payout.count({ where: { status: 'IN_REVIEW' } }),
    db.payout.count({ where: { status: 'AUTO_APPROVED' } }),
    db.payout.count({ where: { status: 'PAID', paidAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }),
    db.payout.count({ where: { status: 'FAILED' } }),
  ])
  return { pending, autoApproved, paidThisMonth, failed }
}

// --- P4 : approuver (Finances) ---

export async function approvePayout(payoutId: string, financeId: string, expectedUpdatedAt: Date): Promise<void> {
  const payout = await db.payout.findUnique({ where: { id: payoutId } })
  if (!payout) throw new Error('PAYOUT_NOT_FOUND')
  if (payout.status !== 'IN_REVIEW') throw new Error('INVALID_PAYOUT_STATUS')

  // Re-vérification du solde retirable (le montant du payout est déjà réservé dans pendingPayoutBalance)
  const wallet = await db.wallet.findUnique({ where: { trainerId: payout.trainerId } })
  if (!wallet) throw new Error('WALLET_NOT_FOUND')
  const withdrawable = wallet.balance - wallet.reservedBalance - (wallet.pendingPayoutBalance - payout.amountFcfa)
  if (payout.amountFcfa > withdrawable) throw new Error('INSUFFICIENT_WITHDRAWABLE_BALANCE')

  const res = await db.payout.updateMany({
    where: { id: payoutId, updatedAt: expectedUpdatedAt, status: 'IN_REVIEW' },
    data: { status: 'APPROVED', wireInitiatedAt: new Date(), idempotencyKey: `payout:${payoutId}`, reviewedById: financeId, reviewedAt: new Date(), approvedById: financeId, approvedAt: new Date() },
  })
  if (res.count === 0) throw new Error('STALE_PAYOUT')
  await db.payoutReviewEvent.create({ data: { payoutId, fromStatus: 'IN_REVIEW', toStatus: 'APPROVED', actorId: financeId, actorRole: 'FINANCES' } })
  await auditStandalone({ actorId: financeId, actorRole: 'FINANCES', action: 'PAYOUT_APPROVED', targetType: 'Payout', targetId: payoutId, meta: {} })
}

// --- P5 : rejeter (Finances) ---

export async function rejectPayout(payoutId: string, financeId: string, expectedUpdatedAt: Date, reason: string): Promise<void> {
  const payout = await db.payout.findUnique({ where: { id: payoutId } })
  if (!payout) throw new Error('PAYOUT_NOT_FOUND')
  if (payout.status !== 'IN_REVIEW') throw new Error('INVALID_PAYOUT_STATUS')

  await db.$transaction(async (tx) => {
    const res = await tx.payout.updateMany({ where: { id: payoutId, updatedAt: expectedUpdatedAt, status: 'IN_REVIEW' }, data: { status: 'REJECTED', rejectedById: financeId, rejectedAt: new Date(), rejectionReason: reason } })
    if (res.count === 0) throw new Error('STALE_PAYOUT')
    await tx.wallet.update({ where: { trainerId: payout.trainerId }, data: { pendingPayoutBalance: { decrement: payout.amountFcfa } } })
    await tx.payoutReviewEvent.create({ data: { payoutId, fromStatus: 'IN_REVIEW', toStatus: 'REJECTED', actorId: financeId, actorRole: 'FINANCES', note: reason } })
    await audit(tx, { actorId: financeId, actorRole: 'FINANCES', action: 'PAYOUT_REJECTED', targetType: 'Payout', targetId: payoutId, meta: { reason } })
  })
  const payoutAfter = await db.payout.findUnique({ where: { id: payoutId }, include: { trainerProfile: { include: { user: true } } } })
  if (payoutAfter) await notify(payoutAfter.trainerProfile.user.id, { type: 'PAYOUT_REJECTED', title: 'Retrait rejeté', body: reason })
}

// --- P6 : marquer payé (Finances ou webhook provider) ---

export async function markPayoutPaid(payoutId: string, actorId: string | null, providerReference?: string): Promise<void> {
  const payout = await db.payout.findUnique({ where: { id: payoutId } })
  if (!payout) throw new Error('PAYOUT_NOT_FOUND')
  if (!['AUTO_APPROVED', 'APPROVED'].includes(payout.status)) throw new Error('INVALID_PAYOUT_STATUS')

  await db.$transaction(async (tx) => {
    const res = await tx.payout.updateMany({ where: { id: payoutId, status: { in: ['AUTO_APPROVED', 'APPROVED'] } }, data: { status: 'PAID', paidAt: new Date(), providerReference } })
    if (res.count === 0) return // idempotent
    const wallet = await tx.wallet.update({ where: { trainerId: payout.trainerId }, data: { pendingPayoutBalance: { decrement: payout.amountFcfa }, balance: { decrement: payout.amountFcfa } } })
    await syncNegativeSince(tx, wallet.id)
    await tx.payoutReviewEvent.create({ data: { payoutId, fromStatus: payout.status, toStatus: 'PAID', actorId, actorRole: actorId ? 'FINANCES' : 'SYSTEM' } })
    await audit(tx, { actorId, actorRole: actorId ? 'FINANCES' : 'SYSTEM', action: 'PAYOUT_PAID', targetType: 'Payout', targetId: payoutId, meta: { amountFcfa: payout.amountFcfa } })
  })
}

// --- P7 : échec du virement (webhook) ---

export async function markPayoutFailed(payoutId: string, reason: string): Promise<void> {
  const payout = await db.payout.findUnique({ where: { id: payoutId } })
  if (!payout) throw new Error('PAYOUT_NOT_FOUND')
  if (!['AUTO_APPROVED', 'APPROVED'].includes(payout.status)) throw new Error('INVALID_PAYOUT_STATUS')

  await db.$transaction(async (tx) => {
    const res = await tx.payout.updateMany({ where: { id: payoutId, status: { in: ['AUTO_APPROVED', 'APPROVED'] } }, data: { status: 'FAILED', failedAt: new Date(), failureReason: reason } })
    if (res.count === 0) return
    await tx.wallet.update({ where: { trainerId: payout.trainerId }, data: { pendingPayoutBalance: { decrement: payout.amountFcfa } } })
    await tx.payoutReviewEvent.create({ data: { payoutId, fromStatus: payout.status, toStatus: 'FAILED', note: reason, actorRole: 'SYSTEM' } })
    await audit(tx, { action: 'PAYOUT_FAILED', targetType: 'Payout', targetId: payoutId, meta: { reason } })
  })
}

// --- P8 : ré-ouvrir un retrait échoué (Finances) ---

export async function reopenFailedPayout(payoutId: string, financeId: string): Promise<void> {
  const payout = await db.payout.findUnique({ where: { id: payoutId } })
  if (!payout) throw new Error('PAYOUT_NOT_FOUND')
  if (payout.status !== 'FAILED') throw new Error('INVALID_PAYOUT_STATUS')

  await db.$transaction(async (tx) => {
    await tx.payout.update({ where: { id: payoutId }, data: { status: 'IN_REVIEW' } })
    await tx.wallet.update({ where: { trainerId: payout.trainerId }, data: { pendingPayoutBalance: { increment: payout.amountFcfa } } })
    await tx.payoutReviewEvent.create({ data: { payoutId, fromStatus: 'FAILED', toStatus: 'IN_REVIEW', actorId: financeId, actorRole: 'FINANCES' } })
    await audit(tx, { actorId: financeId, actorRole: 'FINANCES', action: 'PAYOUT_REOPENED', targetType: 'Payout', targetId: payoutId, meta: {} })
  })
}
