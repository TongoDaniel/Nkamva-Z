// ==========================================================================
// Job de rappel : prévenir avant l'effacement d'un compte
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  remindPendingDeletions,
  dueMilestone,
  reminderAction,
} from '@/lib/jobs/remind-pending-deletions'
import { DELETION_GRACE_DAYS } from '@/lib/dto'

const DAY = 86_400_000

/** Instant auquel il reste `daysLeft` jours avant l'effacement. */
function whenDaysLeft(requestedAt: Date, daysLeft: number): Date {
  return new Date(requestedAt.getTime() + (DELETION_GRACE_DAYS - daysLeft) * DAY)
}

describe('dueMilestone', () => {
  it('ne déclenche rien tant que l’échéance est lointaine', () => {
    expect(dueMilestone(30)).toBeNull()
    expect(dueMilestone(8)).toBeNull()
  })

  it('déclenche le rappel à sept jours', () => {
    expect(dueMilestone(7)).toBe(7)
    expect(dueMilestone(5)).toBe(7)
    expect(dueMilestone(1.5)).toBe(7)
  })

  it('retient la seule échéance la plus proche quand plusieurs sont atteintes', () => {
    expect(dueMilestone(1)).toBe(1)
    expect(dueMilestone(0.4)).toBe(1)
  })

  it('se tait une fois l’effacement dû : la purge prend la main', () => {
    expect(dueMilestone(0)).toBeNull()
    expect(dueMilestone(-3)).toBeNull()
  })
})

describe('Job — rappel avant suppression de compte', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function makePendingUser(email: string, requestedAt: Date) {
    return prisma.user.create({
      data: { email, fullName: 'Aminata Diallo', deletionRequestedAt: requestedAt },
    })
  }

  async function reminders(userId: string, daysLeft: 7 | 1) {
    return prisma.auditLog.count({
      where: { action: reminderAction(daysLeft), targetType: 'User', targetId: userId },
    })
  }

  it('ne prévient personne tant que l’échéance est lointaine', async () => {
    const requestedAt = new Date('2026-01-01T08:00:00.000Z')
    const user = await makePendingUser('loin@test.com', requestedAt)

    const result = await remindPendingDeletions(whenDaysLeft(requestedAt, 12))
    expect(result).toMatchObject({ eligible: 0, sent: 0, failed: 0 })
    expect(await reminders(user.id, 7)).toBe(0)
  })

  it('prévient à sept jours de l’échéance', async () => {
    const requestedAt = new Date('2026-01-01T08:00:00.000Z')
    const user = await makePendingUser('sept@test.com', requestedAt)

    const result = await remindPendingDeletions(whenDaysLeft(requestedAt, 7))
    expect(result).toMatchObject({ eligible: 1, sent: 1, failed: 0 })
    expect(await reminders(user.id, 7)).toBe(1)
    expect(await reminders(user.id, 1)).toBe(0)

    const log = await prisma.auditLog.findFirst({
      where: { action: reminderAction(7), targetId: user.id },
    })
    expect(log!.meta).toMatchObject({ daysLeft: 7 })
  })

  it('ne renvoie pas deux fois la même échéance', async () => {
    const requestedAt = new Date('2026-01-01T08:00:00.000Z')
    const user = await makePendingUser('deuxfois@test.com', requestedAt)

    await remindPendingDeletions(whenDaysLeft(requestedAt, 7))
    // Le lendemain, l'échéance J-7 est toujours « atteinte » mais déjà servie.
    const second = await remindPendingDeletions(whenDaysLeft(requestedAt, 6))
    expect(second).toMatchObject({ eligible: 0, sent: 0 })
    expect(await reminders(user.id, 7)).toBe(1)
  })

  it('envoie le second rappel à un jour de l’échéance', async () => {
    const requestedAt = new Date('2026-01-01T08:00:00.000Z')
    const user = await makePendingUser('veille@test.com', requestedAt)

    await remindPendingDeletions(whenDaysLeft(requestedAt, 7))
    const second = await remindPendingDeletions(whenDaysLeft(requestedAt, 1))
    expect(second).toMatchObject({ eligible: 1, sent: 1 })
    expect(await reminders(user.id, 7)).toBe(1)
    expect(await reminders(user.id, 1)).toBe(1)
  })

  it('n’envoie qu’un message quand le job a été arrêté plusieurs jours', async () => {
    const requestedAt = new Date('2026-01-01T08:00:00.000Z')
    const user = await makePendingUser('rattrapage@test.com', requestedAt)

    // Aucun passage entre J-7 et J-1 : on ne déverse pas la file en retard.
    const result = await remindPendingDeletions(whenDaysLeft(requestedAt, 1))
    expect(result).toMatchObject({ eligible: 1, sent: 1 })
    expect(await reminders(user.id, 1)).toBe(1)
    expect(await reminders(user.id, 7)).toBe(0)
  })

  it('se tait une fois l’effacement dû', async () => {
    const requestedAt = new Date('2026-01-01T08:00:00.000Z')
    const user = await makePendingUser('depasse@test.com', requestedAt)

    const result = await remindPendingDeletions(whenDaysLeft(requestedAt, -1))
    expect(result).toMatchObject({ eligible: 0, sent: 0 })
    expect(await reminders(user.id, 1)).toBe(0)
  })

  it('ignore un compte sans demande de suppression', async () => {
    const user = await prisma.user.create({ data: { email: 'actif@test.com' } })

    const result = await remindPendingDeletions(new Date('2026-06-01T08:00:00.000Z'))
    expect(result.eligible).toBe(0)
    expect(await reminders(user.id, 7)).toBe(0)
  })

  it('ignore un compte déjà effacé', async () => {
    const requestedAt = new Date('2026-01-01T08:00:00.000Z')
    const user = await prisma.user.create({
      data: { email: 'efface@test.com', deletionRequestedAt: requestedAt, deletedAt: new Date() },
    })

    const result = await remindPendingDeletions(whenDaysLeft(requestedAt, 7))
    expect(result.eligible).toBe(0)
    expect(await reminders(user.id, 7)).toBe(0)
  })

  it('redonne droit au rappel après une annulation puis une nouvelle demande', async () => {
    const first = new Date('2026-01-01T08:00:00.000Z')
    const user = await makePendingUser('reprise@test.com', first)

    const firstRunAt = whenDaysLeft(first, 7)
    await remindPendingDeletions(firstRunAt)
    expect(await reminders(user.id, 7)).toBe(1)

    // L'audit s'horodate à l'heure réelle ; le job, lui, reçoit une horloge
    // simulée. On recale l'entrée sur l'instant simulé, sans quoi le premier
    // rappel paraîtrait postérieur à la seconde demande.
    await prisma.auditLog.updateMany({
      where: { action: reminderAction(7), targetId: user.id },
      data: { createdAt: firstRunAt },
    })

    // Annulation, puis nouvelle demande bien plus tard.
    await prisma.user.update({ where: { id: user.id }, data: { deletionRequestedAt: null } })
    const second = new Date('2026-06-01T08:00:00.000Z')
    await prisma.user.update({ where: { id: user.id }, data: { deletionRequestedAt: second } })

    const result = await remindPendingDeletions(whenDaysLeft(second, 7))
    expect(result).toMatchObject({ eligible: 1, sent: 1 })
    expect(await reminders(user.id, 7)).toBe(2)
  })

  it('traite plusieurs comptes échus en une passe', async () => {
    const requestedAt = new Date('2026-01-01T08:00:00.000Z')
    await makePendingUser('un@test.com', requestedAt)
    await makePendingUser('deux@test.com', requestedAt)
    await makePendingUser('trois@test.com', new Date('2026-02-15T08:00:00.000Z'))

    const result = await remindPendingDeletions(whenDaysLeft(requestedAt, 7))
    expect(result).toMatchObject({ eligible: 2, sent: 2, failed: 0 })
  })
})
