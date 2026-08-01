// ==========================================================================
// Lot 2 — Litiges vus par le formateur
// ==========================================================================
// Décision 19 : le formateur voit le motif catégoriel et le titre de la
// ressource, jamais le `reasonDetail` rédigé par l'apprenant, ni son identité,
// ni le fil de discussion. Le `select` Prisma est la garantie de cette règle —
// les champs interdits ne sont pas filtrés après coup, ils ne sont jamais lus.
//
// Sa contestation n'entre pas dans le fil du litige : elle prend la forme d'un
// SupportTicket rattaché au dossier. Sans quoi l'apprenant, qui lit le fil,
// découvrirait la défense du formateur — la confidentialité doit jouer dans
// les deux sens.
// ==========================================================================

import { db } from './db'
import { audit } from './audit'
import { notifyAdminSubRole } from './notification'
import { DisputeError } from './disputes'

export const CONTEST_MAX_LENGTH = 3000

function fail(code: string): never {
  throw new DisputeError(code)
}

/** Ce que le formateur a le droit de voir d'un litige. */
const TRAINER_DISPUTE_SELECT = {
  id: true,
  status: true,
  reason: true,
  resolution: true,
  disputedAmountFcfa: true,
  openedAt: true,
  resolvedAt: true,
  lastActivityAt: true,
  purchase: { select: { id: true, course: { select: { title: true, slug: true, format: true } } } },
  fundReservations: {
    select: { status: true, reservedAmountFcfa: true, debitedAmount: true, releasedAmount: true },
  },
} as const

export async function listTrainerDisputes(trainerId: string, page = 1, pageSize = 20) {
  const [items, total] = await Promise.all([
    db.dispute.findMany({
      where: { trainerId },
      select: TRAINER_DISPUTE_SELECT,
      orderBy: { openedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.dispute.count({ where: { trainerId } }),
  ])
  return { items, total, page, pageSize }
}

export async function getTrainerDispute(disputeId: string, trainerId: string) {
  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    select: { ...TRAINER_DISPUTE_SELECT, trainerId: true },
  })
  // Le litige d'un autre formateur est introuvable, pas interdit.
  if (!dispute || dispute.trainerId !== trainerId) return null

  const tickets = await db.supportTicket.findMany({
    where: { disputeId },
    select: {
      id: true, reason: true, status: true, resolutionNote: true,
      resolvedAt: true, createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  return { ...dispute, tickets }
}

/** Somme encore gelée sur l'ensemble des dossiers du formateur. */
export async function getFrozenTotal(trainerId: string): Promise<number> {
  const result = await db.fundReservation.aggregate({
    where: { status: 'ACTIVE', dispute: { trainerId } },
    _sum: { reservedAmountFcfa: true },
  })
  return result._sum.reservedAmountFcfa ?? 0
}

/**
 * Le formateur apporte des éléments au dossier. Un seul ticket ouvert à la
 * fois : la modération doit traiter une contestation avant d'en recevoir une
 * autre sur le même litige.
 */
export async function contestDispute(
  disputeId: string,
  trainerUserId: string,
  trainerId: string,
  reason: string,
) {
  const text = reason.trim()
  if (text.length < 20) fail('CONTEST_TOO_SHORT')
  if (text.length > CONTEST_MAX_LENGTH) fail('CONTEST_TOO_LONG')

  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    select: { id: true, trainerId: true, purchase: { select: { course: { select: { title: true } } } } },
  })
  if (!dispute || dispute.trainerId !== trainerId) fail('DISPUTE_NOT_FOUND')

  const pending = await db.supportTicket.count({ where: { disputeId, status: 'OPEN' } })
  if (pending > 0) fail('CONTEST_ALREADY_OPEN')

  const ticket = await db.$transaction(async (tx) => {
    const created = await tx.supportTicket.create({
      data: { disputeId, trainerId: trainerUserId, reason: text, status: 'OPEN' },
      select: { id: true, reason: true, status: true, createdAt: true },
    })
    // Le dossier remonte dans la file : une contestation appelle un examen.
    await tx.dispute.update({ where: { id: disputeId }, data: { lastActivityAt: new Date() } })
    await audit(tx, {
      actorId: trainerUserId, actorRole: 'TRAINER',
      action: 'DISPUTE_CONTESTED_BY_TRAINER', targetType: 'Dispute', targetId: disputeId,
      meta: { ticketId: created.id },
    })
    return created
  })

  await notifyAdminSubRole('MODERATION', {
    type: 'DISPUTE_TRAINER_CONTEST',
    title: 'Un formateur conteste un litige',
    body: `Éléments apportés sur « ${dispute.purchase.course?.title ?? 'une ressource'} ».`,
    link: `/admin/litiges/${disputeId}`,
  })

  return ticket
}

/** Réponse de la modération à une contestation de formateur. */
export async function resolveSupportTicket(
  ticketId: string,
  adminId: string,
  resolutionNote: string,
) {
  const note = resolutionNote.trim()
  if (note.length < 10) fail('RESOLUTION_NOTE_REQUIRED')

  const { count } = await db.supportTicket.updateMany({
    where: { id: ticketId, status: 'OPEN' },
    data: { status: 'RESOLVED', resolutionNote: note, resolvedById: adminId, resolvedAt: new Date() },
  })
  if (count === 0) fail('TICKET_NOT_OPEN')

  const ticket = await db.supportTicket.findUnique({
    where: { id: ticketId },
    select: { disputeId: true, trainerId: true },
  })
  if (ticket) {
    await db.notification.create({
      data: {
        userId: ticket.trainerId,
        type: 'DISPUTE_CONTEST_ANSWERED',
        title: 'Réponse à votre contestation',
        body: note,
        link: `/formateur/litiges/${ticket.disputeId}`,
      },
    })
  }
}
