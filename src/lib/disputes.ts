// ==========================================================================
// Lot 2 — Litiges & chargebacks
// ==========================================================================
// Machine à états Dispute (T1-T10) et FundReservation (FR1-FR5).
//
// Invariants tenus par ce module :
//   - Wallet.reservedBalance = SUM(FundReservation.reservedAmountFcfa WHERE ACTIVE)
//   - aucun état terminal d'un litige ne laisse une FundReservation en ACTIVE
//   - Purchase.accessSuspended porte la suspension d'accès (décision 18)
//   - reasonDetail n'est jamais exposé au formateur (décision 19)
//   - jamais de double débit : un chargeback sur une vente déjà remboursée est
//     contesté auprès du provider au lieu d'ouvrir un litige (décision 17)
// ==========================================================================

import type {
  DisputeReason,
  DisputeResolution,
  DisputeStatus,
  Prisma,
} from '@prisma/client'
import { db } from './db'
import { audit, auditStandalone } from './audit'
import { notify, notifyAdminSubRole, deliverSideEffects, absoluteUrl } from './notification'
import { sendEmail, renderSimpleEmail } from './email'
import { assertCanWrite } from './user-sanctions'
import { presignUpload } from './s3'
import { syncNegativeSince } from './wallet'
import { PLATFORM_COMMISSION_RATE, TRAINER_SHARE_RATE } from './commission'
import { getStripe } from './stripe'
import { isPawaPayConfigured, refundAmountFromDeposit, requestRefund, PawaPayError } from './pawapay'
import type { PrismaTransaction } from './types'

// --- Constantes ---

export const LEARNER_RESPONSE_DEADLINE_DAYS = 7
// Réexportés depuis `commission.ts` : les écrans publics ont besoin du taux
// sans embarquer Prisma ni le fournisseur de paiement que ce module importe.
export { PLATFORM_COMMISSION_RATE, TRAINER_SHARE_RATE }
export const WALLET_NEGATIVE_ALERT_DAYS = 60
// Le remboursement PawaPay est asynchrone : plus de délai d'attente à borner ici,
// le timeout HTTP vit dans `pawapay.ts` (REQUEST_TIMEOUT_MS).
export const REFUND_REQUEST_TIMEOUT_SECONDS = 30
export const DISPUTE_MESSAGE_MAX_LENGTH = 5000
export const DISPUTE_OPENING_WINDOW_DAYS = 14
export const CONSUMPTION_THRESHOLD = 0.3
export const ATTACHMENT_MAX_SIZE_BYTES = 5_242_880
export const ATTACHMENT_ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
export const ATTACHMENT_TTL_HOURS = 24

// Formats réputés consommés à 100 % dès le téléchargement (décision 14).
const DOWNLOADABLE_FORMATS = ['pdf', 'kit', 'notion', 'tableur']

export const ACTIVE_DISPUTE_STATUSES: DisputeStatus[] = ['OPEN', 'IN_REVIEW', 'WAITING_LEARNER']
export const TERMINAL_DISPUTE_STATUSES: DisputeStatus[] = ['RESOLVED_REFUNDED', 'RESOLVED_REJECTED', 'RESOLVED_AUTO']

// Dispute.refundStatus est un String libre au schéma : on en fixe le vocabulaire ici.
export type RefundStatus = 'PENDING' | 'MANUAL_PENDING' | 'COMPLETED' | 'FAILED' | 'NOT_APPLICABLE'

export function trainerShareOf(amountFcfa: number): number {
  return Math.round(amountFcfa * TRAINER_SHARE_RATE)
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000)
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 86_400_000)
}

// ==========================================================================
// Consommation (décision 14) — snapshot figé à l'ouverture du litige
// ==========================================================================

export interface ConsumptionEvaluation {
  courseId: string
  courseFormat: string
  watchedSeconds: number | null
  courseDurationSeconds: number | null
  /**
   * Document — la page atteinte et le total. Purement informatifs : ils
   * n'entrent dans aucun calcul d'éligibilité, ils disent à l'agent ce que
   * l'apprenant a lu quand la règle automatique ne s'applique pas (F8.1).
   */
  lastPage: number | null
  coursePageCount: number | null
  downloaded: boolean | null
  consumptionPercent: number
  /** La règle automatique des 30 % s'applique-t-elle à ce format ? */
  ruleApplies: boolean
  /** Motif de refus d'ouverture, null si l'ouverture est permise. */
  blocked: 'RESOURCE_CONSUMED' | 'RESOURCE_DOWNLOADED' | null
}

type PurchaseForConsumption = {
  id: string
  learnerId: string
  courseId: string | null
  communityId: string | null
  periodStart: Date | null
  periodEnd: Date | null
}

export async function computeConsumptionSnapshot(purchase: PurchaseForConsumption): Promise<ConsumptionEvaluation> {
  // Abonnement communauté : prorata de la période courante, pas de CourseView.
  if (!purchase.courseId) {
    const start = purchase.periodStart?.getTime()
    const end = purchase.periodEnd?.getTime()
    let percent = 0
    if (start && end && end > start) {
      percent = Math.min(100, Math.max(0, Math.round(((Date.now() - start) / (end - start)) * 100)))
    }
    return {
      // ConsumptionSnapshot.courseId n'est pas nullable au schéma : pour un
      // abonnement on y stocke l'identifiant de la communauté, discriminé par
      // courseFormat = 'community'.
      courseId: purchase.communityId ?? purchase.id,
      courseFormat: 'community',
      watchedSeconds: null,
      courseDurationSeconds: null,
      lastPage: null,
      coursePageCount: null,
      downloaded: null,
      consumptionPercent: percent,
      ruleApplies: true,
      blocked: percent >= CONSUMPTION_THRESHOLD * 100 ? 'RESOURCE_CONSUMED' : null,
    }
  }

  const course = await db.course.findUnique({
    where: { id: purchase.courseId },
    select: { id: true, format: true, durationSeconds: true, pageCount: true },
  })
  const view = await db.courseView.findUnique({
    where: { courseId_learnerId: { courseId: purchase.courseId, learnerId: purchase.learnerId } },
    select: { watchedSeconds: true, downloaded: true, lastPage: true },
  })

  const format = course?.format ?? 'unknown'

  // Format téléchargeable : un seul signal booléen, la règle des 30 % ne
  // s'applique pas ; un contenu téléchargé est réputé consommé à 100 %.
  if (DOWNLOADABLE_FORMATS.includes(format)) {
    const downloaded = view?.downloaded ?? false
    return {
      courseId: purchase.courseId,
      courseFormat: format,
      watchedSeconds: null,
      courseDurationSeconds: course?.durationSeconds ?? null,
      // La lecture en ligne d'un PDF, désormais possible (F3.2), est reportée
      // telle quelle. Elle **ne modifie ni `consumptionPercent` ni `blocked`** :
      // l'éligibilité d'un format téléchargeable reste celle de F8.1, et la
      // changer serait un arbitrage de paiement, pas une conséquence de lot.
      lastPage: view?.lastPage ?? null,
      coursePageCount: course?.pageCount ?? null,
      downloaded,
      consumptionPercent: downloaded ? 100 : 0,
      ruleApplies: false,
      blocked: downloaded ? 'RESOURCE_DOWNLOADED' : null,
    }
  }

  // Format streamé : règle des 30 % sur watchedSeconds / durationSeconds.
  const watched = view?.watchedSeconds ?? 0
  const duration = course?.durationSeconds ?? null
  const percent = duration && duration > 0 ? Math.min(100, Math.round((watched / duration) * 100)) : 0

  return {
    courseId: purchase.courseId,
    courseFormat: format,
    watchedSeconds: watched,
    courseDurationSeconds: duration,
    lastPage: null,
    coursePageCount: null,
    downloaded: view?.downloaded ?? false,
    consumptionPercent: percent,
    ruleApplies: true,
    blocked: percent >= CONSUMPTION_THRESHOLD * 100 ? 'RESOURCE_CONSUMED' : null,
  }
}

// ==========================================================================
// Helpers wallet / réservations
// ==========================================================================

async function getOrCreateWallet(tx: PrismaTransaction, trainerId: string) {
  const existing = await tx.wallet.findUnique({ where: { trainerId } })
  if (existing) return existing
  const created = await tx.wallet.create({ data: { trainerId } })
  await audit(tx, {
    action: 'WALLET_AUTO_CREATED', targetType: 'Wallet', targetId: created.id,
    meta: { trainerId, reason: 'wallet_missing_on_dispute_reservation' },
  })
  return created
}

// FR1 : ∅ → ACTIVE
async function createReservation(
  tx: PrismaTransaction,
  params: { disputeId: string; trainerId: string; disputedAmountFcfa: number },
) {
  const wallet = await getOrCreateWallet(tx, params.trainerId)
  const reservedAmountFcfa = trainerShareOf(params.disputedAmountFcfa)

  const reservation = await tx.fundReservation.create({
    data: { disputeId: params.disputeId, walletId: wallet.id, reservedAmountFcfa, status: 'ACTIVE' },
  })
  await tx.wallet.update({
    where: { id: wallet.id },
    data: { reservedBalance: { increment: reservedAmountFcfa } },
  })
  await syncNegativeSince(tx, wallet.id)
  await audit(tx, {
    action: 'FUND_RESERVATION_CREATED', targetType: 'FundReservation', targetId: reservation.id,
    meta: { disputeId: params.disputeId, walletId: wallet.id, reservedAmountFcfa },
  })
  return reservation
}

// FR2 / FR5 : ACTIVE → RELEASED (balance non affecté)
async function releaseReservations(
  tx: PrismaTransaction,
  disputeId: string,
  params: { releasedById: string | null; releaseReason: string },
): Promise<number> {
  const reservations = await tx.fundReservation.findMany({ where: { disputeId, status: 'ACTIVE' } })
  let total = 0
  for (const reservation of reservations) {
    await tx.fundReservation.update({
      where: { id: reservation.id },
      data: {
        status: 'RELEASED',
        releasedAmount: reservation.reservedAmountFcfa,
        releasedAt: new Date(),
        releasedById: params.releasedById,
        releaseReason: params.releaseReason,
      },
    })
    await tx.wallet.update({
      where: { id: reservation.walletId },
      data: { reservedBalance: { decrement: reservation.reservedAmountFcfa } },
    })
    await syncNegativeSince(tx, reservation.walletId)
    total += reservation.reservedAmountFcfa
    await audit(tx, {
      actorId: params.releasedById,
      action: 'FUND_RESERVATION_RELEASED', targetType: 'FundReservation', targetId: reservation.id,
      meta: { disputeId, reservedAmountFcfa: reservation.reservedAmountFcfa, reason: params.releaseReason },
    })
  }
  return total
}

// FR3 / FR4 : ACTIVE → DEBITED / PARTIALLY_DEBITED
async function debitReservations(
  tx: PrismaTransaction,
  disputeId: string,
  params: { full: boolean; refundAmountFcfa: number; actorId: string | null },
): Promise<{ debited: number; released: number }> {
  const reservations = await tx.fundReservation.findMany({ where: { disputeId, status: 'ACTIVE' } })
  let debitedTotal = 0
  let releasedTotal = 0

  for (const reservation of reservations) {
    // FULL : le formateur est débité de toute la réservation.
    // PARTIAL : prorata — 85 % du montant remboursé, le reste est libéré (décision 12).
    const debitedAmount = params.full
      ? reservation.reservedAmountFcfa
      : Math.min(reservation.reservedAmountFcfa, trainerShareOf(params.refundAmountFcfa))
    const releasedAmount = reservation.reservedAmountFcfa - debitedAmount

    await tx.fundReservation.update({
      where: { id: reservation.id },
      data: {
        status: params.full ? 'DEBITED' : 'PARTIALLY_DEBITED',
        debitedAmount,
        releasedAmount,
        releasedAt: new Date(),
        releasedById: params.actorId,
        releaseReason: params.full ? 'FULL_REFUND' : 'PARTIAL_REFUND',
      },
    })
    await tx.wallet.update({
      where: { id: reservation.walletId },
      data: {
        reservedBalance: { decrement: reservation.reservedAmountFcfa },
        balance: { decrement: debitedAmount },
      },
    })
    await syncNegativeSince(tx, reservation.walletId)
    debitedTotal += debitedAmount
    releasedTotal += releasedAmount
    await audit(tx, {
      actorId: params.actorId,
      action: 'FUND_RESERVATION_DEBITED', targetType: 'FundReservation', targetId: reservation.id,
      meta: { disputeId, reservedAmountFcfa: reservation.reservedAmountFcfa, debitedAmount, releasedAmount },
    })
  }
  return { debited: debitedTotal, released: releasedTotal }
}

async function recordTransition(
  tx: PrismaTransaction,
  params: {
    disputeId: string
    fromStatus: DisputeStatus
    toStatus: DisputeStatus
    actorId: string | null
    actorRole: string
    note?: string | null
  },
) {
  await tx.disputeReviewEvent.create({
    data: {
      disputeId: params.disputeId,
      fromStatus: params.fromStatus,
      toStatus: params.toStatus,
      actorId: params.actorId,
      actorRole: params.actorRole,
      note: params.note ?? null,
    },
  })
}

// ==========================================================================
// T1 — Ouverture d'un litige par l'apprenant
// ==========================================================================

export interface OpenDisputeInput {
  purchaseId: string
  reason: DisputeReason
  reasonDetail?: string | null
  attachments?: string[]
}

export async function openDispute(learnerId: string, input: OpenDisputeInput) {
  // Arbitrage 63 — un compte restreint n'écrit plus : ni litige, ni message.
  await assertCanWrite(learnerId)

  const purchase = await db.purchase.findUnique({
    where: { id: input.purchaseId },
    include: {
      course: { select: { id: true, title: true } },
      community: { select: { id: true, name: true } },
      trainerProfile: { select: { id: true, userId: true, user: { select: { id: true, email: true, fullName: true } } } },
    },
  })

  if (!purchase) throw new Error('PURCHASE_NOT_FOUND')
  if (purchase.learnerId !== learnerId) throw new Error('NOT_OWNER')
  // Un litige oppose deux parties. `initiatePurchase` interdit désormais
  // d'acheter chez soi (`CANNOT_BUY_OWN_COURSE`), donc plus aucun achat
  // auto-référencé ne naît — mais ceux qui ont pu naître avant restent en base,
  // et instruire un dossier où l'apprenant et le formateur sont la même
  // personne ferait réserver des fonds contre son propre portefeuille.
  if (purchase.trainerProfile.userId === learnerId) throw new Error('CANNOT_DISPUTE_OWN_SALE')
  if (purchase.providerStatus !== 'SUCCEEDED') throw new Error('PURCHASE_NOT_SUCCEEDED')
  if (purchase.refundedAt) throw new Error('ALREADY_REFUNDED')

  // Décision 17 — un litige déjà actif (y compris un chargeback provider) sur
  // la même vente : on redirige vers le fil existant plutôt que d'en créer un.
  const active = await db.dispute.findFirst({
    where: { purchaseId: purchase.id, status: { in: ACTIVE_DISPUTE_STATUSES } },
    select: { id: true },
  })
  if (active) throw new Error('DISPUTE_ALREADY_ACTIVE')

  // Décision 18 — ouverture possible jusqu'au 14e jour inclus.
  if (purchase.createdAt < daysAgo(DISPUTE_OPENING_WINDOW_DAYS)) throw new Error('DISPUTE_WINDOW_EXPIRED')

  const consumption = await computeConsumptionSnapshot(purchase)
  if (consumption.blocked) throw new Error(consumption.blocked)

  const dispute = await db.$transaction(async (tx) => {
    const created = await tx.dispute.create({
      data: {
        purchaseId: purchase.id,
        learnerId,
        trainerId: purchase.trainerId,
        source: 'LEARNER_REQUEST',
        reason: input.reason,
        reasonDetail: input.reasonDetail ?? null,
        status: 'OPEN',
        disputedAmountFcfa: purchase.amountFcfa,
        amountEur: purchase.amountEur,
      },
    })

    const snapshot = await tx.consumptionSnapshot.create({
      data: {
        disputeId: created.id,
        courseId: consumption.courseId,
        courseFormat: consumption.courseFormat,
        watchedSeconds: consumption.watchedSeconds,
        courseDurationSeconds: consumption.courseDurationSeconds,
        lastPage: consumption.lastPage,
        coursePageCount: consumption.coursePageCount,
        downloaded: consumption.downloaded,
        consumptionPercent: consumption.consumptionPercent,
        ruleApplies: consumption.ruleApplies,
      },
    })
    const withSnapshot = await tx.dispute.update({
      where: { id: created.id },
      data: { consumptionSnapshotId: snapshot.id },
    })

    const attachments = await consumeAttachments(learnerId, input.attachments ?? [], created.id, tx)

    if (input.reasonDetail || attachments.length > 0) {
      await tx.disputeMessage.create({
        data: {
          disputeId: created.id,
          authorId: learnerId,
          authorRole: 'LEARNER',
          body: input.reasonDetail ?? '(pièces jointes)',
          attachments,
          readByLearner: true,
        },
      })
    }

    // Décision 18 — l'accès est suspendu dès l'ouverture.
    await tx.purchase.update({
      where: { id: purchase.id },
      data: { accessSuspended: true, accessSuspendedAt: new Date(), accessRestoredAt: null },
    })

    await createReservation(tx, {
      disputeId: created.id,
      trainerId: purchase.trainerId,
      disputedAmountFcfa: purchase.amountFcfa,
    })

    await recordTransition(tx, {
      disputeId: created.id, fromStatus: 'OPEN', toStatus: 'OPEN',
      actorId: learnerId, actorRole: 'LEARNER', note: 'DISPUTE_OPENED',
    })
    await audit(tx, {
      actorId: learnerId, actorRole: 'LEARNER',
      action: 'DISPUTE_OPENED', targetType: 'Dispute', targetId: created.id,
      meta: {
        purchaseId: purchase.id, source: 'LEARNER_REQUEST', reason: input.reason,
        disputedAmountFcfa: purchase.amountFcfa,
        consumptionPercent: consumption.consumptionPercent, ruleApplies: consumption.ruleApplies,
      },
    })

    return withSnapshot
  })

  await deliverSideEffects('DISPUTE_OPENED', { type: 'Dispute', id: dispute.id }, () =>
    notifyDisputeOpened(dispute.id, {
      trainerUserId: purchase.trainerProfile.userId,
      trainerEmail: purchase.trainerProfile.user.email,
      reason: input.reason,
      itemTitle: purchase.course?.title ?? purchase.community?.name ?? 'Ressource',
    }),
  )

  return dispute
}

// Décision 16 — le formateur est notifié mais reste hors du fil ; la notification
// porte le lien « Contester cette décision » (crée un SupportTicket).
// Décision 19 — ni reasonDetail ni le contenu du fil ne lui sont exposés.
async function notifyDisputeOpened(
  disputeId: string,
  params: { trainerUserId: string; trainerEmail: string; reason: DisputeReason; itemTitle: string },
) {
  const contestLink = `/formateur/litiges/${disputeId}/contester`
  await notify(params.trainerUserId, {
    type: 'DISPUTE_OPENED',
    title: 'Un litige a été ouvert sur une de vos ventes',
    body: `Motif : ${params.reason} — ${params.itemTitle}. Les fonds correspondants sont réservés le temps de l'instruction.`,
    link: contestLink,
  })
  await sendEmail({
    to: params.trainerEmail,
    subject: 'NKAMVA — Litige ouvert sur une de vos ventes',
    // `itemTitle` est un titre de ressource saisi par un formateur : il passe
    // par le gabarit, qui l'échappe, et n'est jamais concaténé dans du balisage.
    ...renderSimpleEmail({
      title: 'Litige ouvert sur une de vos ventes',
      paragraphs: [
        `Un litige a été ouvert sur la vente « ${params.itemTitle} ».`,
        `Motif déclaré : ${params.reason}.`,
        'Les fonds correspondants sont réservés sur votre portefeuille le temps de l\'instruction par notre équipe.',
      ],
      cta: { label: 'Contester cette décision', url: absoluteUrl(contestLink) },
    }),
    tags: ['dispute-opened'],
  })
  await notifyAdminSubRole('MODERATION', {
    type: 'DISPUTE_OPENED',
    title: 'Nouveau litige à instruire',
    body: `Motif : ${params.reason} — ${params.itemTitle}`,
    link: `/admin/litiges/${disputeId}`,
  })
}

// ==========================================================================
// T2 / T4 — Messages du fil
// ==========================================================================

export interface PostMessageInput {
  body: string
  attachments?: string[]
  authorId: string
  authorRole: 'LEARNER' | 'SUPPORT'
}

export async function postDisputeMessage(disputeId: string, input: PostMessageInput) {
  if (input.body.length > DISPUTE_MESSAGE_MAX_LENGTH) throw new Error('MESSAGE_TOO_LONG')

  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    select: { id: true, status: true, learnerId: true },
  })
  if (!dispute) throw new Error('DISPUTE_NOT_FOUND')
  if (input.authorRole === 'LEARNER' && dispute.learnerId !== input.authorId) throw new Error('NOT_OWNER')
  if (TERMINAL_DISPUTE_STATUSES.includes(dispute.status)) throw new Error('DISPUTE_CLOSED')

  return db.$transaction(async (tx) => {
    const attachments = await consumeAttachments(input.authorId, input.attachments ?? [], disputeId, tx)

    const message = await tx.disputeMessage.create({
      data: {
        disputeId,
        authorId: input.authorId,
        authorRole: input.authorRole,
        body: input.body,
        attachments,
        // Le message est lu d'office par son auteur, non lu par l'autre partie.
        readByLearner: input.authorRole === 'LEARNER',
        readBySupport: input.authorRole === 'SUPPORT',
      },
    })

    const data: Prisma.DisputeUpdateInput = { lastActivityAt: new Date() }
    let toStatus = dispute.status

    // T2 : premier message du support sur un litige OPEN → IN_REVIEW.
    if (input.authorRole === 'SUPPORT' && dispute.status === 'OPEN') toStatus = 'IN_REVIEW'
    // T4 : réponse de l'apprenant en attente → IN_REVIEW, le délai retombe.
    if (input.authorRole === 'LEARNER' && dispute.status === 'WAITING_LEARNER') {
      toStatus = 'IN_REVIEW'
      data.learnerDeadlineAt = null
    }

    if (toStatus !== dispute.status) {
      data.status = toStatus
      await recordTransition(tx, {
        disputeId, fromStatus: dispute.status, toStatus,
        actorId: input.authorId, actorRole: input.authorRole, note: 'MESSAGE_POSTED',
      })
    }

    await tx.dispute.update({ where: { id: disputeId }, data })
    await audit(tx, {
      actorId: input.authorId, actorRole: input.authorRole,
      action: 'DISPUTE_MESSAGE_POSTED', targetType: 'Dispute', targetId: disputeId,
      meta: { messageId: message.id, attachmentsCount: attachments.length, status: toStatus },
    })

    return message
  })
}

// ==========================================================================
// T3 / T5 — Le support demande un complément à l'apprenant
// ==========================================================================

export interface AskLearnerInput {
  question: string
  expectedUpdatedAt: string
  actorId: string
}

export async function askLearner(disputeId: string, input: AskLearnerInput) {
  if (input.question.length > DISPUTE_MESSAGE_MAX_LENGTH) throw new Error('MESSAGE_TOO_LONG')

  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    select: { id: true, status: true, learnerId: true, learner: { select: { email: true } } },
  })
  if (!dispute) throw new Error('DISPUTE_NOT_FOUND')
  if (!['OPEN', 'IN_REVIEW'].includes(dispute.status)) throw new Error('INVALID_STATUS')

  const deadline = daysFromNow(LEARNER_RESPONSE_DEADLINE_DAYS)

  const updated = await db.$transaction(async (tx) => {
    // Contrôle optimiste : la mise à jour ne passe que si updatedAt n'a pas bougé.
    const guard = await tx.dispute.updateMany({
      where: { id: disputeId, updatedAt: new Date(input.expectedUpdatedAt), status: dispute.status },
      data: { status: 'WAITING_LEARNER', learnerDeadlineAt: deadline, lastActivityAt: new Date() },
    })
    if (guard.count === 0) throw new Error('STALE_DISPUTE')

    await tx.disputeMessage.create({
      data: {
        disputeId,
        authorId: input.actorId,
        authorRole: 'SUPPORT',
        body: input.question,
        readBySupport: true,
      },
    })
    await tx.disputeMessage.create({
      data: {
        disputeId,
        authorRole: 'SYSTEM',
        body: `Une réponse est attendue avant le ${deadline.toISOString().slice(0, 10)}. Sans réponse, le litige sera clos automatiquement.`,
      },
    })

    await recordTransition(tx, {
      disputeId, fromStatus: dispute.status, toStatus: 'WAITING_LEARNER',
      actorId: input.actorId, actorRole: 'SUPPORT', note: 'ASK_LEARNER',
    })
    await audit(tx, {
      actorId: input.actorId, actorRole: 'SUPPORT',
      action: 'DISPUTE_ASK_LEARNER', targetType: 'Dispute', targetId: disputeId,
      meta: { learnerDeadlineAt: deadline.toISOString() },
    })

    return tx.dispute.findUnique({ where: { id: disputeId } })
  })

  await deliverSideEffects('DISPUTE_ASK_LEARNER', { type: 'Dispute', id: disputeId }, async () => {
    await notify(dispute.learnerId, {
      type: 'DISPUTE_WAITING_LEARNER',
      title: 'Le support attend votre réponse',
      body: `Merci de répondre avant le ${deadline.toISOString().slice(0, 10)}, faute de quoi le litige sera clos automatiquement.`,
      link: `/mes-litiges/${disputeId}`,
    })
    await sendEmail({
      to: dispute.learner.email,
      subject: 'NKAMVA — Le support attend votre réponse',
      ...renderSimpleEmail({
        title: 'Le support attend votre réponse',
        paragraphs: [
          'Notre équipe vous a posé une question sur votre litige.',
          `Merci d'y répondre avant le ${deadline.toISOString().slice(0, 10)}. Sans réponse de votre part, le litige sera clos automatiquement.`,
        ],
        cta: { label: 'Répondre', url: absoluteUrl(`/mes-litiges/${disputeId}`) },
      }),
      tags: ['dispute-ask-learner'],
    })
  })

  return updated
}

// ==========================================================================
// T6 / T7 — Résolution par le support
// ==========================================================================

export interface ResolveDisputeInput {
  resolution: DisputeResolution
  resolutionNote?: string | null
  refundAmountFcfa?: number | null
  policyOverride?: boolean
  overrideJustification?: string | null
  expectedUpdatedAt: string
  actorId: string
  actorAdminRole: 'SUPER_ADMIN' | 'FINANCES' | 'MODERATION'
}

export async function resolveDispute(disputeId: string, input: ResolveDisputeInput) {
  if (input.resolution === 'AUTO_TIMEOUT') throw new Error('INVALID_RESOLUTION')

  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    include: {
      purchase: { select: { id: true, provider: true, providerTransactionId: true, providerDisputeActive: true, createdAt: true } },
      consumptionSnapshot: true,
    },
  })
  if (!dispute) throw new Error('DISPUTE_NOT_FOUND')
  if (TERMINAL_DISPUTE_STATUSES.includes(dispute.status)) throw new Error('DISPUTE_ALREADY_RESOLVED')

  if (input.resolution === 'REJECT') {
    return rejectDispute(dispute.id, dispute.status, {
      expectedUpdatedAt: input.expectedUpdatedAt,
      actorId: input.actorId,
      resolutionNote: input.resolutionNote ?? null,
      resolution: 'REJECT',
      notifyLearner: true,
    })
  }

  // --- Remboursement (FULL / PARTIAL) ---

  // Décision 17 — jamais de refund manuel pendant qu'un chargeback provider court.
  if (dispute.purchase.providerDisputeActive) throw new Error('PROVIDER_DISPUTE_ACTIVE')

  const full = input.resolution === 'FULL_REFUND'
  const refundAmountFcfa = full ? dispute.disputedAmountFcfa : (input.refundAmountFcfa ?? 0)
  if (!full) {
    // Strictement inférieur au montant contesté : un « partiel » égal au total
    // est un remboursement intégral déguisé, et il contournerait le contrôle
    // 14 j / 30 % ci-dessous, qui ne s'applique qu'à FULL_REFUND.
    if (refundAmountFcfa <= 0 || refundAmountFcfa >= dispute.disputedAmountFcfa) throw new Error('INVALID_REFUND_AMOUNT')
  }

  if (input.policyOverride) {
    // Le bypass 14j/30 % est réservé au Super-admin et doit être justifié.
    if (input.actorAdminRole !== 'SUPER_ADMIN') throw new Error('OVERRIDE_FORBIDDEN')
    if (!input.overrideJustification) throw new Error('OVERRIDE_JUSTIFICATION_REQUIRED')
  } else if (full) {
    // FULL_REFUND sans override : la règle 14j + 30 % doit être satisfaite.
    //
    // La fenêtre se mesure de l'achat à **l'ouverture du litige**, pas à
    // l'instant de la décision. Comparer à `now` faisait perdre son droit à un
    // apprenant qui avait contesté dans les temps mais dont le dossier
    // attendait en file : le délai d'instruction devenait sa faute.
    const openingDeadline = new Date(
      dispute.purchase.createdAt.getTime() + DISPUTE_OPENING_WINDOW_DAYS * 86_400_000,
    )
    const withinWindow = dispute.openedAt <= openingDeadline
    const snapshot = dispute.consumptionSnapshot
    const consumptionOk = !snapshot
      || (snapshot.ruleApplies
        ? snapshot.consumptionPercent < CONSUMPTION_THRESHOLD * 100
        : snapshot.downloaded !== true)
    if (!withinWindow || !consumptionOk) throw new Error('REFUND_RULE_NOT_MET')
  }

  await db.$transaction(async (tx) => {
    const guard = await tx.dispute.updateMany({
      where: { id: disputeId, updatedAt: new Date(input.expectedUpdatedAt), status: dispute.status },
      data: {
        status: 'RESOLVED_REFUNDED',
        resolution: input.resolution,
        resolutionNote: input.resolutionNote ?? null,
        overrideJustification: input.policyOverride ? input.overrideJustification : null,
        resolvedById: input.actorId,
        resolvedAt: new Date(),
        lastActivityAt: new Date(),
        // La réservation reste ACTIVE et l'accès reste suspendu tant que le
        // remboursement n'est pas effectivement encaissé (T6).
        refundStatus: 'PENDING' satisfies RefundStatus,
      },
    })
    if (guard.count === 0) throw new Error('STALE_DISPUTE')

    // Montant décidé, pas encore versé : refundedAt reste null.
    await tx.purchase.update({ where: { id: dispute.purchaseId }, data: { refundAmountFcfa } })

    await recordTransition(tx, {
      disputeId, fromStatus: dispute.status, toStatus: 'RESOLVED_REFUNDED',
      actorId: input.actorId, actorRole: 'SUPPORT', note: input.resolution,
    })
    await audit(tx, {
      actorId: input.actorId, actorRole: 'SUPPORT',
      action: 'DISPUTE_RESOLVED_REFUNDED', targetType: 'Dispute', targetId: disputeId,
      meta: {
        resolution: input.resolution, refundAmountFcfa,
        policyOverride: Boolean(input.policyOverride),
        overrideJustification: input.overrideJustification ?? null,
      },
    })
  })

  await processRefund(disputeId, input.actorId)

  return db.dispute.findUnique({ where: { id: disputeId } })
}

// T7 / T10 — rejet : la réservation est libérée, l'accès rétabli.
async function rejectDispute(
  disputeId: string,
  fromStatus: DisputeStatus,
  params: {
    expectedUpdatedAt: string | null
    actorId: string | null
    resolutionNote: string | null
    resolution: DisputeResolution
    notifyLearner: boolean
  },
) {
  const dispute = await db.$transaction(async (tx) => {
    const guard = await tx.dispute.updateMany({
      where: {
        id: disputeId,
        status: fromStatus,
        ...(params.expectedUpdatedAt ? { updatedAt: new Date(params.expectedUpdatedAt) } : {}),
      },
      data: {
        status: params.resolution === 'AUTO_TIMEOUT' ? 'RESOLVED_AUTO' : 'RESOLVED_REJECTED',
        resolution: params.resolution,
        resolutionNote: params.resolutionNote,
        resolvedById: params.actorId,
        resolvedAt: new Date(),
        lastActivityAt: new Date(),
        learnerDeadlineAt: null,
        refundStatus: 'NOT_APPLICABLE' satisfies RefundStatus,
      },
    })
    if (guard.count === 0) throw new Error('STALE_DISPUTE')

    const released = await releaseReservations(tx, disputeId, {
      releasedById: params.actorId,
      releaseReason: params.resolution,
    })

    const current = await tx.dispute.findUniqueOrThrow({ where: { id: disputeId } })

    // Décision 18 — l'accès est rétabli dès lors qu'aucun remboursement n'est dû.
    await tx.purchase.update({
      where: { id: current.purchaseId },
      data: { accessSuspended: false, accessRestoredAt: new Date() },
    })

    await recordTransition(tx, {
      disputeId, fromStatus, toStatus: current.status,
      actorId: params.actorId, actorRole: params.actorId ? 'SUPPORT' : 'SYSTEM', note: params.resolution,
    })
    await audit(tx, {
      actorId: params.actorId, actorRole: params.actorId ? 'SUPPORT' : 'SYSTEM',
      action: params.resolution === 'AUTO_TIMEOUT' ? 'DISPUTE_RESOLVED_AUTO' : 'DISPUTE_RESOLVED_REJECTED',
      targetType: 'Dispute', targetId: disputeId,
      meta: { releasedAmountFcfa: released, resolution: params.resolution },
    })

    return current
  })

  await deliverSideEffects('DISPUTE_RESOLVED', { type: 'Dispute', id: disputeId }, async () => {
    if (params.notifyLearner) {
      await notify(dispute.learnerId, {
        type: params.resolution === 'AUTO_TIMEOUT' ? 'DISPUTE_RESOLVED_AUTO' : 'DISPUTE_RESOLVED_REJECTED',
        title: params.resolution === 'AUTO_TIMEOUT' ? 'Litige clos faute de réponse' : 'Votre litige a été rejeté',
        body: params.resolutionNote ?? 'Votre accès à la ressource a été rétabli.',
        link: `/mes-litiges/${disputeId}`,
      })
    }
    await notifyTrainerResolution(disputeId)
  })

  return dispute
}

// Décision 16 — le formateur est aussi notifié à la résolution, avec le lien
// de contestation. Ni reasonDetail ni le fil ne lui sont exposés.
async function notifyTrainerResolution(disputeId: string) {
  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    select: {
      id: true, resolution: true, status: true, reason: true,
      trainerProfile: { select: { userId: true, user: { select: { email: true } } } },
      purchase: { select: { course: { select: { title: true } }, community: { select: { name: true } } } },
    },
  })
  if (!dispute) return

  const itemTitle = dispute.purchase.course?.title ?? dispute.purchase.community?.name ?? 'Ressource'
  const contestLink = `/formateur/litiges/${dispute.id}/contester`
  const refunded = dispute.status === 'RESOLVED_REFUNDED'

  await notify(dispute.trainerProfile.userId, {
    type: 'DISPUTE_RESOLVED',
    title: refunded ? 'Litige tranché en faveur de l\'apprenant' : 'Litige clos sans remboursement',
    body: refunded
      ? `Un remboursement a été accordé sur « ${itemTitle} ». Votre portefeuille sera débité de la part correspondante.`
      : `Le litige sur « ${itemTitle} » est clos. Les fonds réservés ont été libérés.`,
    link: contestLink,
  })
  await sendEmail({
    to: dispute.trainerProfile.user.email,
    subject: refunded ? 'NKAMVA — Remboursement accordé sur une de vos ventes' : 'NKAMVA — Litige clos sans remboursement',
    ...renderSimpleEmail({
      title: refunded ? 'Remboursement accordé sur une de vos ventes' : 'Litige clos sans remboursement',
      paragraphs: [
        `Le litige portant sur « ${itemTitle} » (motif : ${dispute.reason}) vient d'être tranché.`,
        `Décision : ${dispute.resolution}.`,
      ],
      cta: { label: 'Contester cette décision', url: absoluteUrl(contestLink) },
    }),
    tags: ['dispute-resolved'],
  })
}

// ==========================================================================
// Remboursement : tentative provider, sinon tâche manuelle Finances
// ==========================================================================

/**
 * Décision 15 — remboursement mobile money. La tâche manuelle Finances reste le
 * filet, mais elle cesse d'être le cas nominal.
 *
 * Ce qu'elle remplace : `attemptCinetPayRefund` visait une URL **devinée**
 * (`api-checkout.cinetpay.com/v2/payment/refund`), CinetPay ne documentant aucun
 * endpoint de remboursement. Elle échouait donc à chaque appel, et tout
 * remboursement partait en virement manuel. PawaPay, lui, documente `POST
 * /v2/refunds` : c'est ce contrat-là qui est appelé ici.
 *
 * Trois différences de fond avec la version précédente :
 *
 * · **`refundId` = `disputeId`.** Un UUID que nous possédons déjà, qui sert de
 *   clé d'idempotence chez PawaPay et permet au callback de retrouver le litige
 *   sans table de correspondance.
 * · **Le remboursement est asynchrone.** `ACCEPTED` ne veut pas dire remboursé :
 *   c'est le callback `/api/webhooks/pawapay/refunds` qui conclut. On ne
 *   `completeRefund` donc plus ici — le faire reviendrait à déclarer remboursé
 *   ce qui n'est qu'accepté.
 * · **Un identifiant qui n'est pas un UUID ne part pas.** Les achats hérités de
 *   CinetPay portent un `cp_…` que PawaPay ne connaît pas ; ils vont directement
 *   en tâche manuelle plutôt que de provoquer un rejet.
 */
type RefundAttempt =
  | { ok: true; accepted: true }
  | { ok: false; reason: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function attemptPawaPayRefund(params: {
  disputeId: string
  transactionId: string | null
  amountFcfa: number
  /** Montant total de l'achat, pour établir la proportion remboursée. */
  purchaseAmountFcfa: number
}): Promise<RefundAttempt> {
  if (!isPawaPayConfigured()) return { ok: false, reason: 'PAWAPAY_NOT_CONFIGURED' }
  if (!params.transactionId) return { ok: false, reason: 'MISSING_TRANSACTION_ID' }
  if (!UUID_RE.test(params.transactionId)) return { ok: false, reason: 'LEGACY_TRANSACTION_ID' }

  try {
    // Le montant se dérive du dépôt réellement encaissé, pas d'une nouvelle
    // conversion : hors zone franc, le taux administré a pu bouger entre l'achat
    // et le litige, et un remboursement « intégral » recalculé rendrait autre
    // chose que ce qui a été prélevé.
    const { amount, currency } = await refundAmountFromDeposit(
      params.transactionId,
      params.amountFcfa,
      params.purchaseAmountFcfa,
    )

    const response = await requestRefund({
      refundId: params.disputeId,
      depositId: params.transactionId,
      amount,
      currency,
      clientReferenceId: params.disputeId,
    })

    if (response.status === 'REJECTED') {
      return { ok: false, reason: response.failureReason?.failureCode ?? 'REFUSED' }
    }
    // ACCEPTED comme DUPLICATE_IGNORED valent prise en charge : dans les deux
    // cas PawaPay traite, et le callback tranchera.
    return { ok: true, accepted: true }
  } catch (err) {
    if (err instanceof PawaPayError) {
      return { ok: false, reason: err.failureCode ?? err.message }
    }
    return { ok: false, reason: String(err) }
  }
}

/**
 * Bascule un remboursement en traitement manuel Finances. Exportée parce que le
 * callback de remboursement en a besoin : un refus prononcé par le fournisseur
 * arrive de façon asynchrone, longtemps après `processRefund`.
 */
export async function fallBackToManualRefund(disputeId: string, reason: string): Promise<void> {
  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    select: { resolution: true, disputedAmountFcfa: true, refundStatus: true, purchase: { select: { refundAmountFcfa: true } } },
  })
  if (!dispute) throw new Error('DISPUTE_NOT_FOUND')
  if (dispute.refundStatus === 'COMPLETED') return

  await createManualRefundTask(
    disputeId,
    dispute.purchase.refundAmountFcfa ?? dispute.disputedAmountFcfa,
    dispute.resolution === 'FULL_REFUND',
    'PAWAPAY',
    reason,
  )
}

export async function processRefund(disputeId: string, actorId: string | null): Promise<void> {
  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    include: {
      purchase: {
        select: {
          id: true, provider: true, providerTransactionId: true,
          refundAmountFcfa: true, amountFcfa: true,
        },
      },
    },
  })
  if (!dispute) throw new Error('DISPUTE_NOT_FOUND')
  if (dispute.refundStatus === 'COMPLETED') return

  const refundAmountFcfa = dispute.purchase.refundAmountFcfa ?? dispute.disputedAmountFcfa
  const full = dispute.resolution === 'FULL_REFUND'

  // Décision 15 — PawaPay : demande de remboursement, puis attente du callback.
  if (dispute.purchase.provider === 'PAWAPAY') {
    const attempt = await attemptPawaPayRefund({
      disputeId,
      transactionId: dispute.purchase.providerTransactionId,
      amountFcfa: refundAmountFcfa,
      purchaseAmountFcfa: dispute.purchase.amountFcfa,
    })
    if (attempt.ok) {
      // Volontairement, rien de plus : le litige reste en cours de
      // remboursement jusqu'à ce que `/api/webhooks/pawapay/refunds` confirme.
      // Le déclarer terminé ici sur un simple « accepté » afficherait à
      // l'apprenant un remboursement qui peut encore échouer.
      await auditStandalone({
        actorId, actorRole: actorId ? 'ADMIN' : 'SYSTEM',
        action: 'DISPUTE_REFUND_REQUESTED', targetType: 'Dispute', targetId: disputeId,
        meta: { provider: 'PAWAPAY', refundAmountFcfa },
      })
      return
    }
    await createManualRefundTask(disputeId, refundAmountFcfa, full, 'PAWAPAY', attempt.reason)
    return
  }

  const stripe = getStripe()
  if (!stripe) {
    // Sans clé Stripe, on ne rembourse pas : on ouvre une tâche Finances. La
    // version précédente déclarait le remboursement « réputé accepté par le
    // provider » — l'apprenant voyait donc son argent rendu alors qu'aucun
    // mouvement n'avait eu lieu, et le formateur était débité pour rien.
    await createManualRefundTask(disputeId, refundAmountFcfa, full, 'STRIPE', 'STRIPE_NOT_CONFIGURED')
    return
  }

  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: dispute.purchase.providerTransactionId ?? undefined,
        ...(full ? {} : { amount: refundAmountFcfa }),
      },
      // Idempotence obligatoire, clé = disputeId (décision 15).
      { idempotencyKey: `refund_${disputeId}` },
    )
    await completeRefund(disputeId, refund.id, actorId)
  } catch (err) {
    await createManualRefundTask(disputeId, refundAmountFcfa, full, 'STRIPE', String(err))
  }
}

async function createManualRefundTask(
  disputeId: string,
  refundAmountFcfa: number,
  full: boolean,
  provider: string,
  errorMessage: string,
) {
  const trainerDebitFcfa = trainerShareOf(refundAmountFcfa)
  await db.$transaction(async (tx) => {
    await tx.manualRefundTask.upsert({
      where: { disputeId },
      update: { refundAmountFcfa, trainerDebitFcfa, provider, errorMessage, status: 'PENDING' },
      create: { disputeId, refundAmountFcfa, trainerDebitFcfa, provider, errorMessage, status: 'PENDING' },
    })
    await tx.dispute.update({
      where: { id: disputeId },
      data: { refundStatus: 'MANUAL_PENDING' satisfies RefundStatus },
    })
    await audit(tx, {
      action: 'MANUAL_REFUND_TASK_CREATED', targetType: 'Dispute', targetId: disputeId,
      meta: { refundAmountFcfa, trainerDebitFcfa, provider, full, errorMessage },
    })
  })
  await deliverSideEffects('MANUAL_REFUND_TASK_CREATED', { type: 'Dispute', id: disputeId }, () =>
    notifyAdminSubRole('FINANCES', {
      type: 'MANUAL_REFUND_TASK',
      title: 'Remboursement à exécuter manuellement',
      body: `${refundAmountFcfa} FCFA à rembourser (${provider}). Le litige reste bloqué tant que la tâche n'est pas traitée.`,
      link: `/admin/remboursements-manuels`,
    }),
  )
}

/** FR3 / FR4 — le remboursement est encaissé : on débite réellement le formateur. */
export async function completeRefund(
  disputeId: string,
  providerRefundId: string | null,
  actorId: string | null,
): Promise<void> {
  const applied = await db.$transaction(async (tx) => {
    const dispute = await tx.dispute.findUnique({
      where: { id: disputeId },
      include: { purchase: { select: { id: true, refundAmountFcfa: true } } },
    })
    if (!dispute) throw new Error('DISPUTE_NOT_FOUND')
    // Idempotent : un rejeu (confirmation provider dupliquée, tâche manuelle
    // validée deux fois) ne débite pas le formateur une seconde fois.
    if (dispute.refundStatus === 'COMPLETED') return false

    const full = dispute.resolution === 'FULL_REFUND'
    const refundAmountFcfa = dispute.purchase.refundAmountFcfa ?? dispute.disputedAmountFcfa

    const { debited, released } = await debitReservations(tx, disputeId, {
      full, refundAmountFcfa, actorId,
    })

    await tx.dispute.update({
      where: { id: disputeId },
      data: {
        refundStatus: 'COMPLETED' satisfies RefundStatus,
        refundProcessedAt: new Date(),
        providerRefundId,
      },
    })
    await tx.purchase.update({
      where: { id: dispute.purchaseId },
      data: { refundedAt: new Date(), refundAmountFcfa, providerRefundId },
    })
    await audit(tx, {
      actorId, actorRole: actorId ? 'ADMIN' : 'SYSTEM',
      action: 'DISPUTE_REFUND_COMPLETED', targetType: 'Dispute', targetId: disputeId,
      meta: { refundAmountFcfa, trainerDebitedFcfa: debited, releasedFcfa: released, providerRefundId },
    })
    return true
  })

  if (!applied) return

  await deliverSideEffects('DISPUTE_REFUND_COMPLETED', { type: 'Dispute', id: disputeId }, async () => {
    const dispute = await db.dispute.findUnique({ where: { id: disputeId }, select: { learnerId: true } })
    if (dispute) {
      await notify(dispute.learnerId, {
        type: 'DISPUTE_REFUNDED',
        title: 'Votre remboursement a été effectué',
        body: 'Le remboursement a été transmis à votre moyen de paiement.',
        link: `/mes-litiges/${disputeId}`,
      })
    }
    await notifyTrainerResolution(disputeId)
  })
}

/** FR5 — la tâche manuelle est annulée : la réservation est libérée sans débit. */
export async function releaseFundReservation(
  disputeId: string,
  params: { actorId: string | null; reason: string },
): Promise<number> {
  return db.$transaction(async (tx) => {
    return releaseReservations(tx, disputeId, {
      releasedById: params.actorId,
      releaseReason: params.reason,
    })
  })
}

// ==========================================================================
// T8 — Auto-clôture des litiges en attente de l'apprenant (job horaire)
// ==========================================================================

export async function autoCloseDisputes(): Promise<{ closed: number; disputeIds: string[] }> {
  const expired = await db.dispute.findMany({
    where: { status: 'WAITING_LEARNER', learnerDeadlineAt: { lt: new Date() } },
    select: { id: true },
  })

  const disputeIds: string[] = []
  for (const { id } of expired) {
    try {
      await rejectDispute(id, 'WAITING_LEARNER', {
        expectedUpdatedAt: null,
        actorId: null,
        resolutionNote: 'Clôture automatique : aucune réponse de l\'apprenant dans le délai imparti.',
        resolution: 'AUTO_TIMEOUT',
        notifyLearner: true,
      })
      disputeIds.push(id)
    } catch (err) {
      // Un litige qui a bougé entre-temps (réponse de l'apprenant) sort du lot.
      await auditStandalone({
        action: 'DISPUTE_AUTO_CLOSE_SKIPPED', targetType: 'Dispute', targetId: id,
        meta: { error: String(err) },
      })
    }
  }

  return { closed: disputeIds.length, disputeIds }
}

// ==========================================================================
// T9 / T10 — Chargebacks provider
// ==========================================================================

/**
 * Décision 17 — un chargeback qui arrive sur une vente DÉJÀ remboursée n'est
 * jamais accepté : on le conteste auprès du provider avec la preuve du refund
 * plutôt que de débiter le formateur une seconde fois.
 */
export async function openDisputeFromChargeback(params: {
  providerDisputeId: string
  providerTransactionId: string
  amountFcfa?: number | null
  reason?: DisputeReason
}): Promise<{ created: boolean; disputeId: string | null; doubleDebitPrevented: boolean }> {
  const purchase = await db.purchase.findUnique({
    where: { providerTransactionId: params.providerTransactionId },
    select: {
      id: true, learnerId: true, trainerId: true, amountFcfa: true, amountEur: true,
      courseId: true, communityId: true, periodStart: true, periodEnd: true,
      refundedAt: true, refundAmountFcfa: true, providerRefundId: true,
    },
  })
  if (!purchase) {
    await auditStandalone({
      action: 'CHARGEBACK_PURCHASE_NOT_FOUND',
      meta: { providerDisputeId: params.providerDisputeId, providerTransactionId: params.providerTransactionId },
    })
    return { created: false, disputeId: null, doubleDebitPrevented: false }
  }

  if (purchase.refundedAt) {
    const stripe = getStripe()
    if (stripe) {
      try {
        await stripe.disputes.update(params.providerDisputeId, {
          evidence: {
            refund_policy_disclosure: `Remboursement déjà effectué le ${purchase.refundedAt.toISOString()} (${purchase.refundAmountFcfa ?? purchase.amountFcfa} FCFA, refund ${purchase.providerRefundId ?? 'n/a'}).`,
          },
          submit: true,
        })
      } catch (err) {
        await auditStandalone({
          action: 'CHARGEBACK_CONTEST_FAILED',
          meta: { providerDisputeId: params.providerDisputeId, error: String(err) },
        })
      }
    }
    await auditStandalone({
      action: 'DOUBLE_DEBIT_PREVENTED', targetType: 'Purchase', targetId: purchase.id,
      meta: {
        providerDisputeId: params.providerDisputeId,
        refundedAt: purchase.refundedAt.toISOString(),
        refundAmountFcfa: purchase.refundAmountFcfa,
      },
    })
    await deliverSideEffects('DOUBLE_DEBIT_PREVENTED', { type: 'Purchase', id: purchase.id }, () =>
      notifyAdminSubRole('FINANCES', {
        type: 'DOUBLE_DEBIT_PREVENTED',
        title: 'Chargeback sur une vente déjà remboursée',
        body: 'Le chargeback a été contesté automatiquement auprès du provider. Aucun litige n\'a été ouvert, aucun double débit.',
        link: `/admin/achats/${purchase.id}`,
      }),
    )
    return { created: false, disputeId: null, doubleDebitPrevented: true }
  }

  // Fusion : si un litige est déjà en cours sur la vente, on l'attache au
  // chargeback au lieu d'en ouvrir un second (décision 17).
  const active = await db.dispute.findFirst({
    where: { purchaseId: purchase.id, status: { in: ACTIVE_DISPUTE_STATUSES } },
    select: { id: true },
  })
  if (active) {
    await db.$transaction(async (tx) => {
      await tx.dispute.update({ where: { id: active.id }, data: { providerDisputeId: params.providerDisputeId } })
      await tx.purchase.update({ where: { id: purchase.id }, data: { providerDisputeActive: true } })
      await audit(tx, {
        action: 'CHARGEBACK_MERGED_INTO_DISPUTE', targetType: 'Dispute', targetId: active.id,
        meta: { providerDisputeId: params.providerDisputeId, purchaseId: purchase.id },
      })
    })
    return { created: false, disputeId: active.id, doubleDebitPrevented: false }
  }

  const consumption = await computeConsumptionSnapshot(purchase)

  const dispute = await db.$transaction(async (tx) => {
    const created = await tx.dispute.create({
      data: {
        purchaseId: purchase.id,
        learnerId: purchase.learnerId,
        trainerId: purchase.trainerId,
        source: 'STRIPE_CHARGEBACK',
        reason: params.reason ?? 'UNAUTHORIZED_CHARGE',
        status: 'OPEN',
        disputedAmountFcfa: params.amountFcfa ?? purchase.amountFcfa,
        amountEur: purchase.amountEur,
        providerDisputeId: params.providerDisputeId,
      },
    })

    const snapshot = await tx.consumptionSnapshot.create({
      data: {
        disputeId: created.id,
        courseId: consumption.courseId,
        courseFormat: consumption.courseFormat,
        watchedSeconds: consumption.watchedSeconds,
        courseDurationSeconds: consumption.courseDurationSeconds,
        lastPage: consumption.lastPage,
        coursePageCount: consumption.coursePageCount,
        downloaded: consumption.downloaded,
        consumptionPercent: consumption.consumptionPercent,
        ruleApplies: consumption.ruleApplies,
      },
    })
    await tx.dispute.update({ where: { id: created.id }, data: { consumptionSnapshotId: snapshot.id } })

    await tx.purchase.update({
      where: { id: purchase.id },
      data: {
        providerDisputeActive: true,
        accessSuspended: true, accessSuspendedAt: new Date(), accessRestoredAt: null,
      },
    })

    await createReservation(tx, {
      disputeId: created.id,
      trainerId: purchase.trainerId,
      disputedAmountFcfa: created.disputedAmountFcfa,
    })

    await recordTransition(tx, {
      disputeId: created.id, fromStatus: 'OPEN', toStatus: 'OPEN',
      actorId: null, actorRole: 'SYSTEM', note: 'CHARGEBACK_RECEIVED',
    })
    await audit(tx, {
      action: 'DISPUTE_OPENED', targetType: 'Dispute', targetId: created.id,
      meta: {
        purchaseId: purchase.id, source: 'STRIPE_CHARGEBACK',
        providerDisputeId: params.providerDisputeId,
        disputedAmountFcfa: created.disputedAmountFcfa,
      },
    })

    return created
  })

  await deliverSideEffects('CHARGEBACK_RECEIVED', { type: 'Dispute', id: dispute.id }, () =>
    notifyAdminSubRole('MODERATION', {
      type: 'CHARGEBACK_RECEIVED',
      title: 'Chargeback reçu du provider',
      body: 'Un litige a été ouvert automatiquement et les fonds correspondants sont réservés.',
      link: `/admin/litiges/${dispute.id}`,
    }),
  )

  return { created: true, disputeId: dispute.id, doubleDebitPrevented: false }
}

/** T9 (perdu) / T10 (gagné) — clôture du chargeback par le provider. */
export async function closeChargeback(
  providerDisputeId: string,
  outcome: 'lost' | 'won',
): Promise<{ disputeId: string | null }> {
  const dispute = await db.dispute.findFirst({
    where: { providerDisputeId },
    select: { id: true, status: true, purchaseId: true, disputedAmountFcfa: true },
  })
  if (!dispute) {
    await auditStandalone({
      action: 'CHARGEBACK_CLOSE_DISPUTE_NOT_FOUND', meta: { providerDisputeId, outcome },
    })
    return { disputeId: null }
  }

  await db.purchase.update({ where: { id: dispute.purchaseId }, data: { providerDisputeActive: false } })

  if (TERMINAL_DISPUTE_STATUSES.includes(dispute.status)) return { disputeId: dispute.id }

  if (outcome === 'won') {
    // T10 — le provider nous donne raison : rejet, fonds libérés, accès rétabli.
    await rejectDispute(dispute.id, dispute.status, {
      expectedUpdatedAt: null,
      actorId: null,
      resolutionNote: 'Chargeback tranché en faveur de la plateforme par le provider.',
      resolution: 'REJECT',
      notifyLearner: false,
    })
    return { disputeId: dispute.id }
  }

  // T9 — chargeback perdu : le provider a déjà repris l'argent. On enregistre le
  // remboursement comme acquis (pas d'appel refund : il serait un double débit).
  await db.$transaction(async (tx) => {
    const guard = await tx.dispute.updateMany({
      where: { id: dispute.id, status: dispute.status },
      data: {
        status: 'RESOLVED_REFUNDED',
        resolution: 'FULL_REFUND',
        resolutionNote: 'Chargeback tranché en faveur de l\'apprenant par le provider.',
        resolvedById: null,
        resolvedAt: new Date(),
        lastActivityAt: new Date(),
        refundStatus: 'PENDING' satisfies RefundStatus,
      },
    })
    if (guard.count === 0) throw new Error('STALE_DISPUTE')

    await tx.purchase.update({
      where: { id: dispute.purchaseId },
      data: { refundAmountFcfa: dispute.disputedAmountFcfa },
    })
    await recordTransition(tx, {
      disputeId: dispute.id, fromStatus: dispute.status, toStatus: 'RESOLVED_REFUNDED',
      actorId: null, actorRole: 'SYSTEM', note: 'CHARGEBACK_LOST',
    })
  })

  await completeRefund(dispute.id, providerDisputeId, null)
  return { disputeId: dispute.id }
}

// ==========================================================================
// Pièces jointes (PendingAttachment)
// ==========================================================================

export async function presignDisputeAttachment(
  issuerId: string,
  params: { mimeType: string; sizeBytes: number; sha256: string; disputeId?: string | null },
) {
  if (!ATTACHMENT_ALLOWED_MIMES.includes(params.mimeType)) throw new Error('MIME_NOT_ALLOWED')
  if (params.sizeBytes <= 0 || params.sizeBytes > ATTACHMENT_MAX_SIZE_BYTES) throw new Error('SIZE_EXCEEDS_LIMIT')

  const ext = params.mimeType.split('/')[1]
  const s3Key = `dispute-attachments/${issuerId}/${crypto.randomUUID()}.${ext}`
  const { uploadUrl, expiresAt } = await presignUpload(s3Key, params.mimeType, params.sizeBytes)

  await db.pendingAttachment.create({
    data: {
      s3Key,
      issuerId,
      scope: 'DISPUTE',
      disputeId: params.disputeId ?? null,
      mimeType: params.mimeType,
      sizeBytes: params.sizeBytes,
      sha256: params.sha256,
      expiresAt: new Date(Date.now() + ATTACHMENT_TTL_HOURS * 3_600_000),
    },
  })

  return { uploadUrl, s3Key, expiresAt }
}

// Une pièce jointe n'est rattachable qu'une fois, par son émetteur, avant expiration.
// `client` permet de consommer dans la transaction qui crée le litige/message,
// pour qu'un échec ne laisse pas des pièces jointes brûlées sans porteur.
async function consumeAttachments(
  issuerId: string,
  s3Keys: string[],
  disputeId?: string,
  client: PrismaTransaction | typeof db = db,
): Promise<string[]> {
  if (s3Keys.length === 0) return []

  const pending = await client.pendingAttachment.findMany({
    where: { s3Key: { in: s3Keys }, issuerId, scope: 'DISPUTE', status: 'PENDING', consumedAt: null },
    select: { id: true, s3Key: true, expiresAt: true },
  })
  const usable = pending.filter(p => p.expiresAt > new Date())
  if (usable.length !== s3Keys.length) throw new Error('ATTACHMENT_INVALID')

  await client.pendingAttachment.updateMany({
    where: { id: { in: usable.map(p => p.id) } },
    data: { status: 'CONSUMED', consumedAt: new Date(), consumedIn: disputeId ?? 'DISPUTE', disputeId: disputeId ?? null },
  })

  return usable.map(p => p.s3Key)
}

// ==========================================================================
// Contestation formateur (décision 16) — hors du fil, via un SupportTicket
// ==========================================================================

export async function contestDispute(
  disputeId: string,
  params: { trainerUserId: string; trainerProfileId: string; reason: string; attachments?: string[] },
) {
  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    select: { id: true, trainerId: true },
  })
  if (!dispute) throw new Error('DISPUTE_NOT_FOUND')
  if (dispute.trainerId !== params.trainerProfileId) throw new Error('NOT_OWNER')

  const existing = await db.supportTicket.findFirst({
    where: { disputeId, trainerId: params.trainerUserId, status: 'OPEN' },
    select: { id: true },
  })
  if (existing) throw new Error('CONTEST_ALREADY_OPEN')

  const attachments = await consumeAttachments(params.trainerUserId, params.attachments ?? [], disputeId)

  const ticket = await db.supportTicket.create({
    data: {
      disputeId,
      trainerId: params.trainerUserId,
      reason: params.reason,
      attachments,
      status: 'OPEN',
    },
  })

  await auditStandalone({
    actorId: params.trainerUserId, actorRole: 'TRAINER',
    action: 'DISPUTE_CONTESTED', targetType: 'SupportTicket', targetId: ticket.id,
    meta: { disputeId },
  })
  await deliverSideEffects('DISPUTE_CONTESTED', { type: 'SupportTicket', id: ticket.id }, () =>
    notifyAdminSubRole('MODERATION', {
      type: 'DISPUTE_CONTESTED',
      title: 'Un formateur conteste une décision de litige',
      body: params.reason.slice(0, 200),
      link: `/admin/litiges/${disputeId}`,
    }),
  )

  return ticket
}

// ==========================================================================
// Lectures
// ==========================================================================

const LEARNER_DISPUTE_SELECT = {
  id: true, purchaseId: true, source: true, reason: true, reasonDetail: true, status: true,
  disputedAmountFcfa: true, resolution: true, resolutionNote: true, refundStatus: true,
  openedAt: true, lastActivityAt: true, learnerDeadlineAt: true, resolvedAt: true,
  createdAt: true, updatedAt: true,
} satisfies Prisma.DisputeSelect

export async function listMyDisputes(learnerId: string, page = 1, pageSize = 20) {
  const [items, total] = await Promise.all([
    db.dispute.findMany({
      where: { learnerId },
      select: {
        ...LEARNER_DISPUTE_SELECT,
        purchase: { select: { course: { select: { title: true, slug: true } }, community: { select: { name: true } } } },
      },
      orderBy: { lastActivityAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.dispute.count({ where: { learnerId } }),
  ])
  return { items, total, page, pageSize }
}

export async function getDisputeForLearner(disputeId: string, learnerId: string) {
  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    select: {
      ...LEARNER_DISPUTE_SELECT,
      learnerId: true,
      // createdAt / accessSuspended : affichés sur le détail du litige côté apprenant.
      purchase: { select: { id: true, amountFcfa: true, createdAt: true, accessSuspended: true, course: { select: { title: true, slug: true } }, community: { select: { name: true } } } },
      messages: { orderBy: { createdAt: 'asc' } },
      consumptionSnapshot: true,
    },
  })
  if (!dispute) throw new Error('DISPUTE_NOT_FOUND')
  if (dispute.learnerId !== learnerId) throw new Error('NOT_OWNER')

  await db.disputeMessage.updateMany({
    where: { disputeId, authorRole: { in: ['SUPPORT', 'SYSTEM'] }, readByLearner: false },
    data: { readByLearner: true },
  })

  return dispute
}

export interface ListDisputesFilters {
  status?: DisputeStatus
  source?: string
  trainerId?: string
  page?: number
  pageSize?: number
}

export async function listDisputes(filters: ListDisputesFilters) {
  const page = filters.page ?? 1
  const pageSize = Math.min(filters.pageSize ?? 20, 50)
  const where: Prisma.DisputeWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.source ? { source: filters.source as Prisma.EnumDisputeSourceFilter['equals'] } : {}),
    ...(filters.trainerId ? { trainerId: filters.trainerId } : {}),
  }

  const [items, total] = await Promise.all([
    db.dispute.findMany({
      where,
      include: {
        learner: { select: { id: true, email: true, fullName: true } },
        trainerProfile: { select: { id: true, verifiedLegalName: true } },
        purchase: { select: { id: true, amountFcfa: true, provider: true, course: { select: { title: true } } } },
        _count: { select: { messages: true } },
      },
      orderBy: { lastActivityAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.dispute.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function getDisputeForAdmin(disputeId: string) {
  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    include: {
      learner: { select: { id: true, email: true, fullName: true } },
      trainerProfile: { select: { id: true, verifiedLegalName: true, user: { select: { email: true } } } },
      purchase: {
        select: {
          id: true, amountFcfa: true, provider: true, providerTransactionId: true,
          providerDisputeActive: true, accessSuspended: true, refundedAt: true, refundAmountFcfa: true,
          createdAt: true, course: { select: { id: true, title: true, format: true } },
        },
      },
      messages: { orderBy: { createdAt: 'asc' } },
      reviewEvents: { orderBy: { createdAt: 'asc' } },
      fundReservations: true,
      consumptionSnapshot: true,
      manualRefundTask: true,
      supportTickets: true,
    },
  })
  if (!dispute) throw new Error('DISPUTE_NOT_FOUND')

  await db.disputeMessage.updateMany({
    where: { disputeId, authorRole: 'LEARNER', readBySupport: false },
    data: { readBySupport: true },
  })

  return dispute
}

export async function getDisputeStats() {
  const [byStatus, bySource, pendingManualRefunds, activeReservations, resolved] = await Promise.all([
    db.dispute.groupBy({ by: ['status'], _count: { _all: true } }),
    db.dispute.groupBy({ by: ['source'], _count: { _all: true } }),
    db.manualRefundTask.count({ where: { status: 'PENDING' } }),
    db.fundReservation.aggregate({ where: { status: 'ACTIVE' }, _sum: { reservedAmountFcfa: true } }),
    db.dispute.findMany({
      where: { resolvedAt: { not: null } },
      select: { openedAt: true, resolvedAt: true },
      take: 500,
      orderBy: { resolvedAt: 'desc' },
    }),
  ])

  const resolutionDurations = resolved
    .map(d => (d.resolvedAt!.getTime() - d.openedAt.getTime()) / 3_600_000)
  const avgResolutionHours = resolutionDurations.length
    ? Math.round(resolutionDurations.reduce((a, b) => a + b, 0) / resolutionDurations.length)
    : null

  return {
    byStatus: Object.fromEntries(byStatus.map(r => [r.status, r._count._all])),
    bySource: Object.fromEntries(bySource.map(r => [r.source, r._count._all])),
    openCount: byStatus
      .filter(r => ACTIVE_DISPUTE_STATUSES.includes(r.status))
      .reduce((a, r) => a + r._count._all, 0),
    pendingManualRefunds,
    reservedTotalFcfa: activeReservations._sum.reservedAmountFcfa ?? 0,
    avgResolutionHours,
  }
}

/**
 * Décision 19 — le formateur voit le motif (enum) et le titre de la ressource,
 * jamais reasonDetail ni le contenu du fil.
 */
export async function listTrainerDisputes(trainerProfileId: string, page = 1, pageSize = 20) {
  const [items, total] = await Promise.all([
    db.dispute.findMany({
      where: { trainerId: trainerProfileId },
      select: {
        id: true, status: true, reason: true, source: true,
        disputedAmountFcfa: true, resolution: true, refundStatus: true,
        openedAt: true, lastActivityAt: true, resolvedAt: true,
        purchase: { select: { id: true, course: { select: { title: true, slug: true } }, community: { select: { name: true } } } },
        fundReservations: { select: { reservedAmountFcfa: true, status: true, debitedAmount: true, releasedAmount: true } },
        supportTickets: { select: { id: true, status: true, createdAt: true } },
      },
      orderBy: { lastActivityAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.dispute.count({ where: { trainerId: trainerProfileId } }),
  ])
  return { items, total, page, pageSize }
}

// ==========================================================================
// Compatibilité front (écrans issus de la branche design tokens)
// ==========================================================================
// Ces écrans ont été écrits contre une autre implémentation du Lot 2. On ne
// duplique pas les règles : tout ci-dessous s'adosse aux services ci-dessus.

/** Erreur métier des services de revue. Mappée en HTTP par les routes. */
export class DisputeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DisputeError'
  }
}

/** Libellés des motifs, affichés à l'apprenant, au formateur et en revue. */
export const REASON_LABELS: Record<DisputeReason, string> = {
  CONTENT_MISMATCH: 'Le contenu ne correspond pas à la description',
  DOUBLE_CHARGE: 'Double prélèvement',
  ACCESS_ISSUE: "Problème d'accès à la ressource",
  UNAUTHORIZED_CHARGE: 'Paiement non autorisé',
  OTHER: 'Autre motif',
}

/** Alias : même signature et même retour que `getDisputeForLearner`. */
export const getMyDispute = getDisputeForLearner

export interface EligibilityVerdict {
  eligible: boolean
  reason?: string
  daysSincePurchase: number
  assessment: { consumptionPercent: number; ruleApplies: boolean; downloaded: boolean | null }
}

/**
 * Pré-vol en lecture seule de `openDispute` : mêmes contrôles, dans le même
 * ordre, sans rien écrire. Permet d'expliquer le refus à l'apprenant avant
 * qu'il ne remplisse le dossier, plutôt que de le lui opposer ensuite.
 *
 * Toute règle d'ouverture ajoutée à `openDispute` doit l'être ici aussi.
 */
export async function getDisputeEligibility(purchaseId: string, learnerId: string) {
  const purchase = await db.purchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true, learnerId: true, providerStatus: true, refundedAt: true, createdAt: true,
      courseId: true, communityId: true, periodStart: true, periodEnd: true,
      course: { select: { id: true, title: true } },
    },
  })
  if (!purchase) throw new DisputeError('PURCHASE_NOT_FOUND')
  if (purchase.learnerId !== learnerId) throw new DisputeError('NOT_OWNER')

  const consumption = await computeConsumptionSnapshot(purchase)
  const assessment = {
    consumptionPercent: consumption.consumptionPercent,
    ruleApplies: consumption.ruleApplies,
    downloaded: consumption.downloaded,
  }
  const daysSincePurchase = Math.floor((Date.now() - purchase.createdAt.getTime()) / 86_400_000)

  const refuse = (reason: string): { purchase: typeof purchase; verdict: EligibilityVerdict } => ({
    purchase,
    verdict: { eligible: false, reason, daysSincePurchase, assessment },
  })

  if (purchase.providerStatus !== 'SUCCEEDED') return refuse('PURCHASE_NOT_SUCCEEDED')
  if (purchase.refundedAt) return refuse('ALREADY_REFUNDED')

  const active = await db.dispute.findFirst({
    where: { purchaseId: purchase.id, status: { in: ACTIVE_DISPUTE_STATUSES } },
    select: { id: true },
  })
  if (active) return refuse('DISPUTE_ALREADY_ACTIVE')

  if (purchase.createdAt < daysAgo(DISPUTE_OPENING_WINDOW_DAYS)) return refuse('DISPUTE_WINDOW_EXPIRED')
  if (consumption.blocked) return refuse(consumption.blocked)

  return { purchase, verdict: { eligible: true, daysSincePurchase, assessment } as EligibilityVerdict }
}
