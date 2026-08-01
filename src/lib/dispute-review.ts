// ==========================================================================
// Lot 2 — Arbitrage des litiges, côté administration
// ==========================================================================
// Transitions : T2 (prise en charge), T3/T5 (question à l'apprenant),
// T6 (remboursement), T7 (rejet), et sur les fonds FR2 à FR5.
//
// Le remboursement se fait en deux temps, et c'est délibéré. `resolve` acte la
// décision et laisse `refundStatus = PENDING` : tant que l'argent n'est pas
// réellement rendu à l'apprenant, la réserve du formateur reste ACTIVE et son
// solde intact. Le débit n'a lieu qu'à la confirmation du remboursement.
// Décider et payer sont deux événements distincts ; les confondre débiterait
// un formateur pour un remboursement qui pourrait échouer.
// ==========================================================================

import type { DisputeResolution, DisputeStatus } from '@prisma/client'
import { db } from './db'
import { audit } from './audit'
import { notify } from './notification'
import { sendEmail } from './email'
import { DisputeError, LEARNER_RESPONSE_DEADLINE_DAYS, TRAINER_SHARE_RATE, DISPUTE_MESSAGE_MAX_LENGTH } from './disputes'

const DAY = 86_400_000

function fail(code: string): never {
  throw new DisputeError(code)
}

function appUrl(path: string): string {
  const base = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || 'https://nkamva.com'
  return `${base}${path}`
}

const OPEN_STATUSES: DisputeStatus[] = ['OPEN', 'IN_REVIEW', 'WAITING_LEARNER']

// --- Listing ---

export async function listDisputes(filters: {
  status?: DisputeStatus
  page: number
  pageSize: number
}) {
  const where = filters.status ? { status: filters.status } : {}
  const [items, total] = await Promise.all([
    db.dispute.findMany({
      where,
      select: {
        id: true, status: true, reason: true, source: true, disputedAmountFcfa: true,
        openedAt: true, lastActivityAt: true, learnerDeadlineAt: true, resolution: true,
        refundStatus: true, updatedAt: true,
        learner: { select: { id: true, email: true, fullName: true } },
        purchase: { select: { id: true, course: { select: { title: true } } } },
        messages: { where: { readBySupport: false, authorRole: 'LEARNER' }, select: { id: true } },
      },
      // Les dossiers les plus anciennement actifs remontent : personne ne doit
      // attendre indéfiniment parce qu'un dossier plus récent passe devant.
      orderBy: { lastActivityAt: 'asc' },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    db.dispute.count({ where }),
  ])
  return { items, total, page: filters.page, pageSize: filters.pageSize }
}

export async function getDisputeStats() {
  const rows = await db.dispute.groupBy({ by: ['status'], _count: { _all: true } })
  const count = (status: DisputeStatus) => rows.find((r) => r.status === status)?._count._all ?? 0
  return {
    open: count('OPEN'),
    inReview: count('IN_REVIEW'),
    waitingLearner: count('WAITING_LEARNER'),
    refunded: count('RESOLVED_REFUNDED'),
    rejected: count('RESOLVED_REJECTED'),
    auto: count('RESOLVED_AUTO'),
    total: rows.reduce((sum, r) => sum + r._count._all, 0),
  }
}

export async function getDisputeForReview(disputeId: string) {
  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    select: {
      id: true, status: true, source: true, reason: true, reasonDetail: true,
      disputedAmountFcfa: true, resolution: true, resolutionNote: true,
      overrideJustification: true, refundStatus: true, refundProcessedAt: true,
      openedAt: true, lastActivityAt: true, learnerDeadlineAt: true, resolvedAt: true,
      updatedAt: true,
      learner: { select: { id: true, email: true, fullName: true } },
      trainerProfile: { select: { id: true, user: { select: { email: true, fullName: true } } } },
      purchase: {
        select: {
          id: true, amountFcfa: true, provider: true, accessSuspended: true,
          refundedAt: true, providerDisputeActive: true, createdAt: true,
          course: { select: { id: true, title: true, slug: true, format: true } },
        },
      },
      consumptionSnapshot: true,
      fundReservations: {
        select: { id: true, status: true, reservedAmountFcfa: true, debitedAmount: true, releasedAmount: true },
      },
      manualRefundTask: {
        select: { id: true, status: true, refundAmountFcfa: true, trainerDebitFcfa: true, provider: true },
      },
      messages: {
        select: { id: true, authorRole: true, body: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
      reviewEvents: {
        select: { fromStatus: true, toStatus: true, note: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!dispute) return null

  // Ouvrir le dossier vaut lecture des messages de l'apprenant.
  await db.disputeMessage.updateMany({
    where: { disputeId, authorRole: 'LEARNER', readBySupport: false },
    data: { readBySupport: true },
  })

  return dispute
}

// --- Garde de concurrence ---

async function loadForDecision(disputeId: string, expectedUpdatedAt: string) {
  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    select: {
      id: true, status: true, updatedAt: true, learnerId: true, trainerId: true,
      purchaseId: true, disputedAmountFcfa: true, openedAt: true,
      consumptionSnapshot: { select: { consumptionPercent: true, ruleApplies: true, downloaded: true } },
      purchase: { select: { id: true, createdAt: true, provider: true, providerDisputeActive: true, refundedAt: true } },
    },
  })
  if (!dispute) fail('DISPUTE_NOT_FOUND')
  if (dispute.updatedAt.toISOString() !== new Date(expectedUpdatedAt).toISOString()) {
    fail('STALE_DISPUTE')
  }
  return dispute
}

// --- T2 : prise en charge par le support ---

export async function postSupportMessage(disputeId: string, adminId: string, body: string) {
  const text = body.trim()
  if (!text) fail('MESSAGE_EMPTY')
  if (text.length > DISPUTE_MESSAGE_MAX_LENGTH) fail('MESSAGE_TOO_LONG')

  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    select: { id: true, status: true, learnerId: true },
  })
  if (!dispute) fail('DISPUTE_NOT_FOUND')
  if (!OPEN_STATUSES.includes(dispute.status)) fail('DISPUTE_CLOSED')

  const message = await db.$transaction(async (tx) => {
    const created = await tx.disputeMessage.create({
      data: {
        disputeId,
        authorId: adminId,
        authorRole: 'SUPPORT',
        body: text,
        readBySupport: true,
        readByLearner: false,
      },
      select: { id: true, authorRole: true, body: true, createdAt: true },
    })

    // T2 : le premier mot du support fait passer le dossier en examen.
    if (dispute.status === 'OPEN') {
      await tx.dispute.update({
        where: { id: disputeId },
        data: { status: 'IN_REVIEW', lastActivityAt: new Date() },
      })
      await tx.disputeReviewEvent.create({
        data: { disputeId, fromStatus: 'OPEN', toStatus: 'IN_REVIEW', actorId: adminId, actorRole: 'ADMIN' },
      })
    } else {
      await tx.dispute.update({ where: { id: disputeId }, data: { lastActivityAt: new Date() } })
    }

    await audit(tx, {
      actorId: adminId, actorRole: 'ADMIN',
      action: 'DISPUTE_SUPPORT_MESSAGE', targetType: 'Dispute', targetId: disputeId,
    })

    return created
  })

  await notify(dispute.learnerId, {
    type: 'DISPUTE_SUPPORT_MESSAGE',
    title: 'Le support a répondu',
    body: 'Un message vous attend dans votre contestation.',
    link: `/mes-litiges/${disputeId}`,
  })

  return message
}

// --- T3 / T5 : question à l'apprenant ---

export async function askLearner(
  disputeId: string,
  adminId: string,
  params: { expectedUpdatedAt: string; question: string },
) {
  const dispute = await loadForDecision(disputeId, params.expectedUpdatedAt)
  if (!['OPEN', 'IN_REVIEW'].includes(dispute.status)) fail('DISPUTE_NOT_ACTIONABLE')

  const question = params.question.trim()
  if (question.length < 10) fail('QUESTION_TOO_SHORT')

  const deadline = new Date(Date.now() + LEARNER_RESPONSE_DEADLINE_DAYS * DAY)
  const from = dispute.status

  await db.$transaction(async (tx) => {
    const { count } = await tx.dispute.updateMany({
      where: { id: disputeId, status: from, updatedAt: dispute.updatedAt },
      data: { status: 'WAITING_LEARNER', learnerDeadlineAt: deadline, lastActivityAt: new Date() },
    })
    if (count === 0) fail('STALE_DISPUTE')

    await tx.disputeMessage.create({
      data: { disputeId, authorId: adminId, authorRole: 'SUPPORT', body: question, readBySupport: true, readByLearner: false },
    })
    // Le compte à rebours est écrit dans le fil : l'apprenant doit lire
    // l'échéance au même endroit que la question.
    await tx.disputeMessage.create({
      data: {
        disputeId,
        authorRole: 'SYSTEM',
        body: `Sans réponse de votre part avant le ${deadline.toLocaleDateString('fr-FR')}, ce dossier sera clos et votre accès à la ressource rétabli.`,
        readBySupport: true,
        readByLearner: false,
      },
    })
    await tx.disputeReviewEvent.create({
      data: { disputeId, fromStatus: from, toStatus: 'WAITING_LEARNER', actorId: adminId, actorRole: 'ADMIN' },
    })
    await audit(tx, {
      actorId: adminId, actorRole: 'ADMIN',
      action: 'DISPUTE_ASK_LEARNER', targetType: 'Dispute', targetId: disputeId,
      meta: { deadlineAt: deadline.toISOString() },
    })
  })

  const learner = await db.user.findUnique({ where: { id: dispute.learnerId }, select: { email: true } })
  await notify(dispute.learnerId, {
    type: 'DISPUTE_ASK_LEARNER',
    title: 'Le support attend votre réponse',
    body: 'Une précision est nécessaire pour instruire votre contestation.',
    link: `/mes-litiges/${disputeId}`,
  })
  await sendEmail({
    to: learner!.email,
    subject: 'Une précision est attendue sur votre contestation — NkamVa',
    html: `<p>Le support a besoin d'un élément pour instruire votre dossier :</p><blockquote>${question}</blockquote><p>Sans réponse avant le ${deadline.toLocaleDateString('fr-FR')}, le dossier sera clos et votre accès rétabli.</p><p><a href="${appUrl(`/mes-litiges/${disputeId}`)}">Répondre</a></p>`,
    text: `Le support attend une précision :\n\n${question}\n\nSans réponse avant le ${deadline.toLocaleDateString('fr-FR')}, le dossier sera clos.\n\n${appUrl(`/mes-litiges/${disputeId}`)}`,
    tags: ['dispute'],
  })
}

// --- T6 / T7 : décision ---

export interface ResolveInput {
  expectedUpdatedAt: string
  resolution: Extract<DisputeResolution, 'FULL_REFUND' | 'PARTIAL_REFUND' | 'REJECT'>
  note: string
  /** Montant remboursé, obligatoire en remboursement partiel. */
  refundAmountFcfa?: number
  /** Justification d'un remboursement hors barème — super-admin uniquement. */
  overrideJustification?: string
}

export async function resolveDispute(
  disputeId: string,
  adminId: string,
  isSuperAdmin: boolean,
  input: ResolveInput,
) {
  const dispute = await loadForDecision(disputeId, input.expectedUpdatedAt)
  if (!OPEN_STATUSES.includes(dispute.status)) fail('DISPUTE_CLOSED')

  const note = input.note.trim()
  if (note.length < 10) fail('RESOLUTION_NOTE_REQUIRED')

  if (input.resolution === 'REJECT') {
    return rejectDispute(dispute, adminId, note)
  }

  // Décision 17 : un chargeback en cours chez le provider signifie qu'il
  // rendra peut-être déjà l'argent. Rembourser en parallèle débiterait deux
  // fois le formateur.
  if (dispute.purchase.providerDisputeActive) fail('PROVIDER_DISPUTE_ACTIVE')
  if (dispute.purchase.refundedAt) fail('ALREADY_REFUNDED')

  // Le barème se juge tel qu'il était à l'ouverture du dossier, jamais au
  // moment de la décision : le droit de l'apprenant est acquis quand il
  // conteste. L'évaluer à la décision punirait une instruction qui traîne, et
  // ferait basculer un dossier hors barème pendant qu'on l'examine.
  // La consommation est figée par le ConsumptionSnapshot, exactement pour ça.
  const snapshot = dispute.consumptionSnapshot
  const withinWindow =
    (dispute.openedAt.getTime() - dispute.purchase.createdAt.getTime()) / DAY <= 14
  const withinConsumption =
    !snapshot || (!snapshot.downloaded && (!snapshot.ruleApplies || snapshot.consumptionPercent < 30))
  const withinPolicy = withinWindow && withinConsumption

  if (!withinPolicy) {
    if (!isSuperAdmin) fail('POLICY_OVERRIDE_FORBIDDEN')
    if (!input.overrideJustification?.trim()) fail('OVERRIDE_JUSTIFICATION_REQUIRED')
  }

  const refundAmountFcfa =
    input.resolution === 'FULL_REFUND'
      ? dispute.disputedAmountFcfa
      : (input.refundAmountFcfa ?? 0)

  if (input.resolution === 'PARTIAL_REFUND') {
    if (refundAmountFcfa <= 0 || refundAmountFcfa >= dispute.disputedAmountFcfa) {
      fail('PARTIAL_AMOUNT_INVALID')
    }
  }

  return refundDispute(dispute, adminId, {
    note,
    resolution: input.resolution,
    refundAmountFcfa,
    overrideJustification: withinPolicy ? null : input.overrideJustification!.trim(),
  })
}

type DecisionContext = Awaited<ReturnType<typeof loadForDecision>>

/** T7 : la contestation n'est pas retenue. Les fonds sont rendus, l'accès aussi. */
async function rejectDispute(dispute: DecisionContext, adminId: string, note: string) {
  await db.$transaction(async (tx) => {
    const { count } = await tx.dispute.updateMany({
      where: { id: dispute.id, status: dispute.status, updatedAt: dispute.updatedAt },
      data: {
        status: 'RESOLVED_REJECTED',
        resolution: 'REJECT',
        resolutionNote: note,
        refundStatus: 'NOT_APPLICABLE',
        resolvedById: adminId,
        resolvedAt: new Date(),
        learnerDeadlineAt: null,
        lastActivityAt: new Date(),
      },
    })
    if (count === 0) fail('STALE_DISPUTE')

    await releaseReservations(tx, dispute.id, adminId, 'DISPUTE_REJECTED')

    // Décision 18 : le rejet rend l'accès.
    await tx.purchase.update({
      where: { id: dispute.purchaseId },
      data: { accessSuspended: false, accessRestoredAt: new Date() },
    })

    await tx.disputeReviewEvent.create({
      data: { disputeId: dispute.id, fromStatus: dispute.status, toStatus: 'RESOLVED_REJECTED', actorId: adminId, actorRole: 'ADMIN', note },
    })
    await audit(tx, {
      actorId: adminId, actorRole: 'ADMIN',
      action: 'DISPUTE_REJECTED', targetType: 'Dispute', targetId: dispute.id,
    })
  })

  await notifyOutcome(dispute, 'REJECT', note)
  return { resolution: 'REJECT' as const, refundStatus: 'NOT_APPLICABLE' }
}

/**
 * T6 : la contestation est retenue. La décision est actée, mais le débit
 * n'intervient qu'au remboursement effectif.
 */
async function refundDispute(
  dispute: DecisionContext,
  adminId: string,
  params: {
    note: string
    resolution: 'FULL_REFUND' | 'PARTIAL_REFUND'
    refundAmountFcfa: number
    overrideJustification: string | null
  },
) {
  const provider = dispute.purchase.provider
  // Stripe rembourse par API ; CinetPay non, d'où une tâche manuelle confiée
  // aux finances. En développement, sans clé, le remboursement Stripe est
  // considéré abouti — même convention que l'initiation d'achat.
  const stripeAutomatic = provider === 'STRIPE' && !process.env.STRIPE_SECRET_KEY

  await db.$transaction(async (tx) => {
    const { count } = await tx.dispute.updateMany({
      where: { id: dispute.id, status: dispute.status, updatedAt: dispute.updatedAt },
      data: {
        status: 'RESOLVED_REFUNDED',
        resolution: params.resolution,
        resolutionNote: params.note,
        overrideJustification: params.overrideJustification,
        refundStatus: 'PENDING',
        resolvedById: adminId,
        resolvedAt: new Date(),
        learnerDeadlineAt: null,
        lastActivityAt: new Date(),
      },
    })
    if (count === 0) fail('STALE_DISPUTE')

    if (!stripeAutomatic) {
      await tx.manualRefundTask.create({
        data: {
          disputeId: dispute.id,
          provider,
          refundAmountFcfa: params.refundAmountFcfa,
          trainerDebitFcfa: Math.round(params.refundAmountFcfa * TRAINER_SHARE_RATE),
          status: 'PENDING',
        },
      })
    }

    await tx.disputeReviewEvent.create({
      data: { disputeId: dispute.id, fromStatus: dispute.status, toStatus: 'RESOLVED_REFUNDED', actorId: adminId, actorRole: 'ADMIN', note: params.note },
    })
    await audit(tx, {
      actorId: adminId, actorRole: 'ADMIN',
      action: 'DISPUTE_REFUND_DECIDED', targetType: 'Dispute', targetId: dispute.id,
      meta: {
        resolution: params.resolution,
        refundAmountFcfa: params.refundAmountFcfa,
        provider,
        policyOverride: Boolean(params.overrideJustification),
        manualTask: !stripeAutomatic,
      },
    })
  })

  if (stripeAutomatic) {
    await completeRefund(dispute.id, adminId, {
      refundAmountFcfa: params.refundAmountFcfa,
      providerRefundId: `stripe_dev_${crypto.randomUUID()}`,
    })
  }

  await notifyOutcome(dispute, params.resolution, params.note)
  return {
    resolution: params.resolution,
    refundStatus: stripeAutomatic ? 'COMPLETED' : 'PENDING',
    manualTaskCreated: !stripeAutomatic,
  }
}

// --- FR2 à FR5 : mouvements de fonds ---

/** FR2 / FR5 : la réserve est rendue, le solde n'est pas touché. */
async function releaseReservations(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  disputeId: string,
  actorId: string | null,
  reason: string,
) {
  const reservations = await tx.fundReservation.findMany({
    where: { disputeId, status: 'ACTIVE' },
    select: { id: true, walletId: true, reservedAmountFcfa: true },
  })
  for (const reservation of reservations) {
    await tx.fundReservation.update({
      where: { id: reservation.id },
      data: {
        status: 'RELEASED',
        releasedAmount: reservation.reservedAmountFcfa,
        releasedAt: new Date(),
        releasedById: actorId,
        releaseReason: reason,
      },
    })
    await tx.wallet.update({
      where: { id: reservation.walletId },
      data: { reservedBalance: { decrement: reservation.reservedAmountFcfa } },
    })
  }
  return reservations.length
}

/**
 * FR3 / FR4 : le remboursement est confirmé. C'est le seul moment où le solde
 * du formateur baisse. La réserve est levée en totalité ; seule la part
 * correspondant au montant réellement remboursé est débitée, le reste revient
 * au formateur.
 */
export async function completeRefund(
  disputeId: string,
  actorId: string | null,
  params: { refundAmountFcfa: number; providerRefundId?: string },
) {
  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    select: {
      id: true, status: true, refundStatus: true, resolution: true, purchaseId: true,
      disputedAmountFcfa: true,
      fundReservations: { where: { status: 'ACTIVE' }, select: { id: true, walletId: true, reservedAmountFcfa: true } },
    },
  })
  if (!dispute) fail('DISPUTE_NOT_FOUND')
  if (dispute.status !== 'RESOLVED_REFUNDED') fail('DISPUTE_NOT_REFUNDED')
  if (dispute.refundStatus === 'COMPLETED') return { alreadyCompleted: true }

  // Le montant vient de l'appelant : le déduire ici obligerait à le relire
  // d'une source dérivée, et un remboursement partiel réglé par Stripe n'a pas
  // de tâche manuelle où le retrouver.
  const { refundAmountFcfa, providerRefundId } = params
  const debit = Math.round(refundAmountFcfa * TRAINER_SHARE_RATE)

  await db.$transaction(async (tx) => {
    // Garde : deux confirmations concurrentes ne débitent qu'une fois.
    const { count } = await tx.dispute.updateMany({
      where: { id: disputeId, refundStatus: 'PENDING' },
      data: {
        refundStatus: 'COMPLETED',
        refundProcessedAt: new Date(),
        ...(providerRefundId ? { providerRefundId } : {}),
      },
    })
    if (count === 0) return

    for (const reservation of dispute.fundReservations) {
      const debited = Math.min(debit, reservation.reservedAmountFcfa)
      const released = reservation.reservedAmountFcfa - debited
      await tx.fundReservation.update({
        where: { id: reservation.id },
        data: {
          status: released > 0 ? 'PARTIALLY_DEBITED' : 'DEBITED',
          debitedAmount: debited,
          releasedAmount: released,
          releasedAt: new Date(),
          releasedById: actorId,
          releaseReason: 'REFUND_COMPLETED',
        },
      })
      await tx.wallet.update({
        where: { id: reservation.walletId },
        data: {
          // La réserve est levée en totalité, le solde ne baisse que du débit.
          reservedBalance: { decrement: reservation.reservedAmountFcfa },
          balance: { decrement: debited },
        },
      })
    }

    await tx.purchase.update({
      where: { id: dispute.purchaseId },
      data: {
        refundedAt: new Date(),
        refundAmountFcfa,
        providerStatus: 'REFUNDED',
        ...(providerRefundId ? { providerRefundId } : {}),
      },
    })

    await audit(tx, {
      actorId, actorRole: actorId ? 'ADMIN' : 'SYSTEM',
      action: 'DISPUTE_REFUND_COMPLETED', targetType: 'Dispute', targetId: disputeId,
      meta: { refundAmountFcfa, trainerDebitFcfa: debit, providerRefundId: providerRefundId ?? null },
    })
  })

  return { alreadyCompleted: false, refundAmountFcfa, trainerDebitFcfa: debit }
}

// --- Tâches de remboursement manuel ---

export async function listManualRefundTasks(status?: string) {
  return db.manualRefundTask.findMany({
    where: status ? { status } : {},
    select: {
      id: true, status: true, provider: true, refundAmountFcfa: true, trainerDebitFcfa: true,
      errorMessage: true, notes: true, createdAt: true, completedAt: true,
      dispute: {
        select: {
          id: true, disputedAmountFcfa: true, resolution: true,
          learner: { select: { email: true, fullName: true } },
          purchase: { select: { course: { select: { title: true } } } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })
}

/** Le remboursement a bien été effectué chez l'opérateur : on débite. */
export async function completeManualRefundTask(taskId: string, adminId: string, notes?: string) {
  const task = await db.manualRefundTask.findUnique({
    where: { id: taskId },
    select: { id: true, status: true, disputeId: true, refundAmountFcfa: true },
  })
  if (!task) fail('TASK_NOT_FOUND')
  if (task.status !== 'PENDING') fail('TASK_NOT_PENDING')

  const { count } = await db.manualRefundTask.updateMany({
    where: { id: taskId, status: 'PENDING' },
    data: { status: 'COMPLETED', completedAt: new Date(), assignedToId: adminId, notes: notes?.trim() || null },
  })
  if (count === 0) fail('TASK_NOT_PENDING')

  return completeRefund(task.disputeId, adminId, { refundAmountFcfa: task.refundAmountFcfa })
}

/**
 * FR5 : le remboursement n'a pas pu être fait. Les fonds gelés sont rendus au
 * formateur ; l'accès de l'apprenant reste suspendu, la décision de rembourser
 * n'étant pas annulée pour autant — c'est au support de reprendre le dossier.
 */
export async function cancelManualRefundTask(taskId: string, adminId: string, errorMessage: string) {
  const task = await db.manualRefundTask.findUnique({
    where: { id: taskId },
    select: { id: true, status: true, disputeId: true },
  })
  if (!task) fail('TASK_NOT_FOUND')
  if (task.status !== 'PENDING') fail('TASK_NOT_PENDING')
  if (!errorMessage.trim()) fail('ERROR_MESSAGE_REQUIRED')

  await db.$transaction(async (tx) => {
    const { count } = await tx.manualRefundTask.updateMany({
      where: { id: taskId, status: 'PENDING' },
      data: { status: 'CANCELLED', assignedToId: adminId, errorMessage: errorMessage.trim() },
    })
    if (count === 0) fail('TASK_NOT_PENDING')

    await releaseReservations(tx, task.disputeId, adminId, 'MANUAL_REFUND_CANCELLED')
    await tx.dispute.update({
      where: { id: task.disputeId },
      data: { refundStatus: 'FAILED' },
    })
    await audit(tx, {
      actorId: adminId, actorRole: 'ADMIN',
      action: 'MANUAL_REFUND_CANCELLED', targetType: 'Dispute', targetId: task.disputeId,
      meta: { taskId, errorMessage: errorMessage.trim() },
    })
  })
}

// --- Notifications d'issue ---

async function notifyOutcome(dispute: DecisionContext, resolution: string, note: string) {
  const learner = await db.user.findUnique({ where: { id: dispute.learnerId }, select: { email: true } })
  const refunded = resolution !== 'REJECT'

  await notify(dispute.learnerId, {
    type: refunded ? 'DISPUTE_REFUNDED' : 'DISPUTE_REJECTED',
    title: refunded ? 'Votre contestation est retenue' : "Votre contestation n'est pas retenue",
    body: note,
    link: `/mes-litiges/${dispute.id}`,
  })

  if (learner?.email) {
    await sendEmail({
      to: learner.email,
      subject: refunded
        ? 'Votre contestation est retenue — NkamVa'
        : 'Suite donnée à votre contestation — NkamVa',
      html: `<p>${refunded ? 'Votre contestation a été retenue.' : "Votre contestation n'a pas été retenue."}</p><p><b>Motif :</b> ${note}</p>${refunded ? '<p>Le remboursement est engagé. Le délai de réception dépend de votre opérateur.</p>' : "<p>Votre accès à la ressource est rétabli.</p>"}<p><a href="${appUrl(`/mes-litiges/${dispute.id}`)}">Voir le dossier</a></p>`,
      text: `${refunded ? 'Votre contestation a été retenue.' : "Votre contestation n'a pas été retenue."}\n\nMotif : ${note}\n\n${appUrl(`/mes-litiges/${dispute.id}`)}`,
      tags: ['dispute'],
    })
  }

  // Le formateur apprend l'issue financière, jamais le détail du motif.
  const trainer = await db.trainerProfile.findUnique({
    where: { id: dispute.trainerId },
    select: { user: { select: { email: true } } },
  })
  if (trainer?.user?.email) {
    await sendEmail({
      to: trainer.user.email,
      subject: refunded
        ? 'Une contestation a été retenue — NkamVa'
        : 'Une contestation a été écartée — NkamVa',
      html: refunded
        ? `<p>Une contestation portant sur l'un de vos achats a été retenue. La part correspondante sera débitée de votre solde une fois le remboursement effectué.</p>`
        : `<p>Une contestation portant sur l'un de vos achats a été écartée. Les fonds gelés vous sont rendus.</p>`,
      text: refunded
        ? "Une contestation a été retenue. La part correspondante sera débitée une fois le remboursement effectué."
        : 'Une contestation a été écartée. Les fonds gelés vous sont rendus.',
      tags: ['dispute'],
    })
  }
}
