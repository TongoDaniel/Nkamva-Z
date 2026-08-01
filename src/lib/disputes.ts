// ==========================================================================
// Lot 2 — Litiges, côté apprenant
// ==========================================================================
// Transitions couvertes : T1 (ouverture), T2 (première réponse du support),
// T4 (réponse de l'apprenant), et sur les fonds FR1 (réservation). L'arbitrage
// (T3, T5, T6, T7) et les traitements automatiques (T8) relèvent de l'espace
// admin et des tâches planifiées.
//
// Deux invariants gouvernent tout le reste :
//   — ouvrir un litige gèle la part du formateur, sans la lui retirer ;
//   — ouvrir un litige suspend l'accès de l'apprenant à la ressource.
// Les deux sont posés dans la même transaction que la création du dossier.
// ==========================================================================

import type { DisputeReason, DisputeSource } from '@prisma/client'
import { db } from './db'
import { audit } from './audit'
import { notifyAdminSubRole } from './notification'
import { sendEmail } from './email'
import { isDownloadable } from './dto'

export const LEARNER_RESPONSE_DEADLINE_DAYS = 7
export const TRAINER_SHARE_RATE = 0.85
export const DISPUTE_MESSAGE_MAX_LENGTH = 5000

/** Fenêtre pendant laquelle un achat peut être contesté. */
export const DISPUTE_WINDOW_DAYS = 14
/** Au-delà de cette part consultée, le remboursement n'est plus de droit. */
export const CONSUMPTION_THRESHOLD = 0.3

const DAY = 86_400_000

export class DisputeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DisputeError'
  }
}

function fail(code: string): never {
  throw new DisputeError(code)
}

function appUrl(path: string): string {
  const base = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || 'https://nkamva.com'
  return `${base}${path}`
}

// --- Consommation ---

export interface ConsumptionAssessment {
  courseFormat: string
  watchedSeconds: number | null
  courseDurationSeconds: number | null
  downloaded: boolean | null
  consumptionPercent: number
  /** La règle des 30 % s'applique-t-elle à ce format ? */
  ruleApplies: boolean
}

/**
 * Fige ce que l'apprenant a réellement consommé.
 * Un format téléchargeable est binaire : une fois le fichier récupéré, il est
 * chez lui, et la part consultée n'a plus de sens. Un format streamé se mesure.
 */
export function assessConsumption(params: {
  format: string
  durationSeconds: number | null
  watchedSeconds: number
  downloaded: boolean
}): ConsumptionAssessment {
  if (isDownloadable(params.format)) {
    return {
      courseFormat: params.format,
      watchedSeconds: null,
      courseDurationSeconds: null,
      downloaded: params.downloaded,
      consumptionPercent: params.downloaded ? 100 : 0,
      ruleApplies: false,
    }
  }

  const percent =
    params.durationSeconds && params.durationSeconds > 0
      ? Math.min(100, Math.round((params.watchedSeconds / params.durationSeconds) * 100))
      : 0

  return {
    courseFormat: params.format,
    watchedSeconds: params.watchedSeconds,
    courseDurationSeconds: params.durationSeconds,
    downloaded: null,
    consumptionPercent: percent,
    ruleApplies: true,
  }
}

export interface EligibilityVerdict {
  eligible: boolean
  reason?: 'WINDOW_EXPIRED' | 'RESOURCE_DOWNLOADED' | 'CONSUMPTION_EXCEEDED'
  daysSincePurchase: number
  assessment: ConsumptionAssessment
}

/**
 * Décide si un achat ouvre droit à contestation. Le verdict est calculé à part
 * pour pouvoir être présenté à l'apprenant avant qu'il ne s'engage : mieux vaut
 * expliquer le refus en amont que le lui opposer après coup.
 */
export function assessEligibility(params: {
  purchasedAt: Date
  assessment: ConsumptionAssessment
  now?: Date
}): EligibilityVerdict {
  const now = params.now ?? new Date()
  const days = (now.getTime() - params.purchasedAt.getTime()) / DAY
  const base = { daysSincePurchase: Math.floor(days), assessment: params.assessment }

  if (days > DISPUTE_WINDOW_DAYS) return { eligible: false, reason: 'WINDOW_EXPIRED', ...base }
  if (params.assessment.downloaded) return { eligible: false, reason: 'RESOURCE_DOWNLOADED', ...base }
  if (
    params.assessment.ruleApplies &&
    params.assessment.consumptionPercent >= CONSUMPTION_THRESHOLD * 100
  ) {
    return { eligible: false, reason: 'CONSUMPTION_EXCEEDED', ...base }
  }
  return { eligible: true, ...base }
}

// --- Lecture ---

const DISPUTE_SELECT = {
  id: true,
  status: true,
  source: true,
  reason: true,
  reasonDetail: true,
  disputedAmountFcfa: true,
  resolution: true,
  resolutionNote: true,
  refundStatus: true,
  openedAt: true,
  lastActivityAt: true,
  learnerDeadlineAt: true,
  resolvedAt: true,
  updatedAt: true,
  purchase: {
    select: {
      id: true,
      amountFcfa: true,
      accessSuspended: true,
      createdAt: true,
      course: { select: { id: true, title: true, slug: true, format: true } },
    },
  },
  consumptionSnapshot: {
    select: { consumptionPercent: true, ruleApplies: true, downloaded: true, snapshotAt: true },
  },
} as const

const MESSAGE_SELECT = {
  id: true,
  authorRole: true,
  body: true,
  attachments: true,
  createdAt: true,
} as const

export async function listMyDisputes(learnerId: string, page = 1, pageSize = 20) {
  const [items, total] = await Promise.all([
    db.dispute.findMany({
      where: { learnerId },
      select: DISPUTE_SELECT,
      orderBy: { lastActivityAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.dispute.count({ where: { learnerId } }),
  ])
  return { items, total, page, pageSize }
}

export async function getMyDispute(disputeId: string, learnerId: string) {
  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    select: { ...DISPUTE_SELECT, learnerId: true, messages: { select: MESSAGE_SELECT, orderBy: { createdAt: 'asc' } } },
  })
  if (!dispute) return null
  // Un litige d'autrui est introuvable, pas interdit : on ne confirme pas son existence.
  if (dispute.learnerId !== learnerId) return null

  // Ouvrir le fil vaut lecture : les messages du support cessent d'être « non lus ».
  await db.disputeMessage.updateMany({
    where: { disputeId, authorRole: { in: ['SUPPORT', 'SYSTEM'] }, readByLearner: false },
    data: { readByLearner: true },
  })

  return dispute
}

/** Ce que l'apprenant peut savoir avant d'ouvrir un litige sur un achat. */
export async function getDisputeEligibility(purchaseId: string, learnerId: string) {
  const purchase = await db.purchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true, learnerId: true, providerStatus: true, refundedAt: true, createdAt: true,
      courseId: true,
      course: { select: { id: true, title: true, format: true, durationSeconds: true } },
      disputes: { where: { status: { in: ['OPEN', 'IN_REVIEW', 'WAITING_LEARNER'] } }, select: { id: true } },
    },
  })
  if (!purchase || purchase.learnerId !== learnerId) fail('PURCHASE_NOT_FOUND')
  if (purchase.providerStatus !== 'SUCCEEDED') fail('PURCHASE_NOT_ELIGIBLE')
  if (purchase.refundedAt) fail('ALREADY_REFUNDED')
  if (purchase.disputes.length > 0) fail('DISPUTE_ALREADY_OPEN')
  if (!purchase.course || !purchase.courseId) fail('PURCHASE_NOT_ELIGIBLE')

  const view = await db.courseView.findUnique({
    where: { courseId_learnerId: { courseId: purchase.courseId, learnerId } },
    select: { watchedSeconds: true, downloaded: true },
  })

  const assessment = assessConsumption({
    format: purchase.course.format,
    durationSeconds: purchase.course.durationSeconds,
    watchedSeconds: view?.watchedSeconds ?? 0,
    downloaded: view?.downloaded ?? false,
  })

  return {
    purchase,
    verdict: assessEligibility({ purchasedAt: purchase.createdAt, assessment }),
  }
}

// --- T1 : ouverture ---

export interface OpenDisputeInput {
  purchaseId: string
  reason: DisputeReason
  reasonDetail?: string
  source?: DisputeSource
}

export async function openDispute(learnerId: string, input: OpenDisputeInput) {
  const { purchase, verdict } = await getDisputeEligibility(input.purchaseId, learnerId)
  if (!verdict.eligible) fail(verdict.reason!)

  const full = await db.purchase.findUnique({
    where: { id: purchase.id },
    select: { id: true, trainerId: true, amountFcfa: true, trainerShareFcfa: true },
  })
  if (!full) fail('PURCHASE_NOT_FOUND')

  const wallet = await db.wallet.findUnique({
    where: { trainerId: full.trainerId },
    select: { id: true },
  })
  // Sans portefeuille, il n'y a rien à geler : on refuse plutôt que d'ouvrir un
  // litige dont l'issue financière serait indéterminée.
  if (!wallet) fail('TRAINER_WALLET_MISSING')

  // Le gel porte sur la part réellement versée au formateur, pas sur le prix
  // payé : la commission de la plateforme n'est pas dans son portefeuille.
  const reservedAmountFcfa = Math.round(full.amountFcfa * TRAINER_SHARE_RATE)

  const dispute = await db.$transaction(async (tx) => {
    // Garde contre deux ouvertures concurrentes sur le même achat.
    const concurrent = await tx.dispute.count({
      where: { purchaseId: purchase.id, status: { in: ['OPEN', 'IN_REVIEW', 'WAITING_LEARNER'] } },
    })
    if (concurrent > 0) fail('DISPUTE_ALREADY_OPEN')

    const created = await tx.dispute.create({
      data: {
        purchaseId: purchase.id,
        learnerId,
        trainerId: full.trainerId,
        source: input.source ?? 'LEARNER_REQUEST',
        reason: input.reason,
        reasonDetail: input.reasonDetail?.trim() || null,
        status: 'OPEN',
        disputedAmountFcfa: full.amountFcfa,
      },
      select: { id: true },
    })

    // Le constat de consommation est figé maintenant : l'apprenant continue
    // d'avoir accès jusqu'à la suspension, et le dossier doit refléter l'état
    // au moment de la contestation, pas au moment de l'arbitrage.
    const snapshot = await tx.consumptionSnapshot.create({
      data: {
        disputeId: created.id,
        courseId: purchase.courseId!,
        courseFormat: verdict.assessment.courseFormat,
        watchedSeconds: verdict.assessment.watchedSeconds,
        courseDurationSeconds: verdict.assessment.courseDurationSeconds,
        downloaded: verdict.assessment.downloaded,
        consumptionPercent: verdict.assessment.consumptionPercent,
        ruleApplies: verdict.assessment.ruleApplies,
      },
      select: { id: true },
    })
    await tx.dispute.update({
      where: { id: created.id },
      data: { consumptionSnapshotId: snapshot.id },
    })

    // FR1 : les fonds sont gelés, pas retirés. `balance` ne bouge pas.
    await tx.fundReservation.create({
      data: { disputeId: created.id, walletId: wallet.id, reservedAmountFcfa, status: 'ACTIVE' },
    })
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { reservedBalance: { increment: reservedAmountFcfa } },
    })

    // Décision 18 : la suspension vit sur l'achat, pas sur le litige.
    await tx.purchase.update({
      where: { id: purchase.id },
      data: { accessSuspended: true, accessSuspendedAt: new Date() },
    })

    if (input.reasonDetail?.trim()) {
      await tx.disputeMessage.create({
        data: {
          disputeId: created.id,
          authorId: learnerId,
          authorRole: 'LEARNER',
          body: input.reasonDetail.trim(),
        },
      })
    }

    // Pas d'événement de revue à l'ouverture : `DisputeReviewEvent` trace des
    // transitions entre deux états, et il n'y a pas d'état de départ. La
    // création est portée par `openedAt` et l'entrée d'audit ci-dessous.
    await audit(tx, {
      actorId: learnerId, actorRole: 'LEARNER',
      action: 'DISPUTE_OPENED', targetType: 'Dispute', targetId: created.id,
      meta: {
        purchaseId: purchase.id,
        reason: input.reason,
        reservedAmountFcfa,
        consumptionPercent: verdict.assessment.consumptionPercent,
      },
    })

    return created
  })

  await notifyAdminSubRole('MODERATION', {
    type: 'DISPUTE_OPENED',
    title: 'Nouveau litige ouvert',
    body: `Contestation sur « ${purchase.course!.title} ».`,
    link: `/admin/litiges/${dispute.id}`,
  })

  // Décision 19 : le formateur apprend le motif catégoriel, jamais le détail
  // rédigé par l'apprenant.
  const trainer = await db.trainerProfile.findUnique({
    where: { id: full.trainerId },
    select: { user: { select: { email: true } } },
  })
  if (trainer?.user?.email) {
    await sendEmail({
      to: trainer.user.email,
      subject: 'Un achat de votre ressource est contesté — NkamVa',
      html: `<p>Un achat de « ${purchase.course!.title} » fait l'objet d'une contestation.</p><p><b>Motif déclaré :</b> ${REASON_LABELS[input.reason]}</p><p>La part correspondante de votre solde est gelée le temps de l'examen. Elle vous sera rendue si la contestation n'est pas retenue.</p><p>Vous pouvez apporter des éléments :<br><a href="${appUrl('/formateur/litiges')}">${appUrl('/formateur/litiges')}</a></p>`,
      text: `Un achat de « ${purchase.course!.title} » est contesté.\nMotif : ${REASON_LABELS[input.reason]}\n\nLa part correspondante de votre solde est gelée le temps de l'examen.\n\n${appUrl('/formateur/litiges')}`,
      tags: ['dispute'],
    })
  }

  return (await db.dispute.findUnique({ where: { id: dispute.id }, select: DISPUTE_SELECT }))!
}

export const REASON_LABELS: Record<DisputeReason, string> = {
  CONTENT_MISMATCH: 'Le contenu ne correspond pas à la description',
  DOUBLE_CHARGE: 'Double prélèvement',
  ACCESS_ISSUE: "Problème d'accès à la ressource",
  UNAUTHORIZED_CHARGE: 'Paiement non autorisé',
  OTHER: 'Autre motif',
}

// --- T4 : réponse de l'apprenant ---

export async function postLearnerMessage(disputeId: string, learnerId: string, body: string) {
  const text = body.trim()
  if (!text) fail('MESSAGE_EMPTY')
  if (text.length > DISPUTE_MESSAGE_MAX_LENGTH) fail('MESSAGE_TOO_LONG')

  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    select: { id: true, learnerId: true, status: true },
  })
  if (!dispute || dispute.learnerId !== learnerId) fail('DISPUTE_NOT_FOUND')
  if (['RESOLVED_REFUNDED', 'RESOLVED_REJECTED', 'RESOLVED_AUTO'].includes(dispute.status)) {
    fail('DISPUTE_CLOSED')
  }

  return db.$transaction(async (tx) => {
    const message = await tx.disputeMessage.create({
      data: {
        disputeId,
        authorId: learnerId,
        authorRole: 'LEARNER',
        body: text,
        // Le support n'a pas encore vu ce message.
        readBySupport: false,
        readByLearner: true,
      },
      select: MESSAGE_SELECT,
    })

    // T4 : répondre lève l'attente et son échéance. Le compte à rebours
    // d'auto-clôture repart de zéro si le support repose une question.
    const wasWaiting = dispute.status === 'WAITING_LEARNER'
    await tx.dispute.update({
      where: { id: disputeId },
      data: {
        lastActivityAt: new Date(),
        ...(wasWaiting ? { status: 'IN_REVIEW', learnerDeadlineAt: null } : {}),
      },
    })
    if (wasWaiting) {
      await tx.disputeReviewEvent.create({
        data: {
          disputeId,
          fromStatus: 'WAITING_LEARNER',
          toStatus: 'IN_REVIEW',
          actorId: learnerId,
          actorRole: 'LEARNER',
        },
      })
    }

    await audit(tx, {
      actorId: learnerId, actorRole: 'LEARNER',
      action: 'DISPUTE_MESSAGE_POSTED', targetType: 'Dispute', targetId: disputeId,
      meta: { from: dispute.status },
    })

    return message
  })
}
