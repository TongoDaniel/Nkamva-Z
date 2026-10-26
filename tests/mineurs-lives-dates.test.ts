// ==========================================================================
// Lives et dates — campagne du 12 octobre 2026, m12 et m18
// ==========================================================================
// m12 — séances programmées dans le passé, en l'an 9999, en chevauchement pour
//       le même animateur ; séances jamais lancées « programmées » pour
//       toujours.
// m18 — fin de période calculée en heure locale du serveur : un 31 janvier
//       donnait un 3 mars.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { scheduleLiveSession, closeNeverStartedSessions } from '@/lib/lives'
import { addMonthsUtc } from '@/lib/months'
import { periodEndFor as membershipPeriodEnd } from '@/lib/memberships'
import { periodEndFor as subscriptionPeriodEnd } from '@/lib/subscriptions'

const HOUR = 3_600_000
const DAY = 24 * HOUR

describe('m18 — les mois s\'ajoutent en UTC, sans déborder', () => {
  it('31 janvier + 1 mois = dernier jour de février', () => {
    expect(addMonthsUtc(new Date('2027-01-31T10:00:00Z'), 1).toISOString()).toBe('2027-02-28T10:00:00.000Z')
    expect(addMonthsUtc(new Date('2028-01-31T10:00:00Z'), 1).toISOString()).toBe('2028-02-29T10:00:00.000Z')
  })

  it('l\'heure UTC ne bouge pas au passage à l\'heure d\'hiver', () => {
    expect(addMonthsUtc(new Date('2026-10-15T09:30:00Z'), 1).toISOString()).toBe('2026-11-15T09:30:00.000Z')
  })

  it('décembre passe à janvier de l\'année suivante, et l\'année compte douze mois', () => {
    expect(addMonthsUtc(new Date('2026-12-31T00:00:00Z'), 1).toISOString()).toBe('2027-01-31T00:00:00.000Z')
    expect(subscriptionPeriodEnd(new Date('2028-02-29T00:00:00Z'), 'YEARLY').toISOString()).toBe('2029-02-28T00:00:00.000Z')
    expect(membershipPeriodEnd(new Date('2027-01-31T00:00:00Z')).toISOString()).toBe('2027-02-28T00:00:00.000Z')
  })
})

describe('m12 — une séance se programme dans des bornes raisonnables', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup() {
    const trainerUser = await prisma.user.create({ data: { email: 'awa@test.com', role: 'TRAINER' } })
    const trainer = await prisma.trainerProfile.create({ data: { userId: trainerUser.id, approvedAt: new Date() } })
    await prisma.wallet.create({ data: { trainerId: trainer.id, balance: 0 } })
    const community = await prisma.community.create({
      data: { trainerId: trainer.id, name: 'Atelier', slug: 'atelier', priceFcfa: 2500 },
    })
    const schedule = (startsInMs: number, durationMinutes = 60) =>
      scheduleLiveSession(community.id, trainer.id, trainerUser.id, {
        title: 'Atelier en direct', scheduledStartAt: new Date(Date.now() + startsInMs), durationMinutes,
      })
    return { trainer, community, schedule }
  }

  it('ni dans le passé, ni en l\'an 9999', async () => {
    const { schedule } = await setup()
    await expect(schedule(-DAY)).rejects.toThrow('LIVE_START_IN_PAST')
    await expect(schedule(new Date('9999-01-01').getTime() - Date.now())).rejects.toThrow('LIVE_START_TOO_FAR')
    await expect(schedule(DAY)).resolves.toHaveProperty('id')
  })

  it('pas deux séances en même temps pour le même animateur', async () => {
    const { schedule } = await setup()
    await schedule(DAY, 90)
    // Commence pendant la première.
    await expect(schedule(DAY + HOUR, 60)).rejects.toThrow('LIVE_OVERLAP')
    // Commence avant et finit pendant.
    await expect(schedule(DAY - 30 * 60_000, 60)).rejects.toThrow('LIVE_OVERLAP')
    // Juste après : accepté.
    await expect(schedule(DAY + 90 * 60_000, 60)).resolves.toHaveProperty('id')
  })

  it('une séance jamais lancée cesse d\'être programmée un jour après sa fin prévue', async () => {
    const { trainer, community } = await setup()
    const base = { communityId: community.id, trainerId: trainer.id, title: 'Oubliée', durationMinutes: 60 }
    const old = await prisma.liveSession.create({
      data: { ...base, scheduledStartAt: new Date(Date.now() - 3 * DAY), roomName: `nkamva-${crypto.randomUUID()}` },
    })
    const recent = await prisma.liveSession.create({
      data: { ...base, scheduledStartAt: new Date(Date.now() - 2 * HOUR), roomName: `nkamva-${crypto.randomUUID()}` },
    })

    expect(await closeNeverStartedSessions()).toEqual({ closed: 1 })
    expect((await prisma.liveSession.findUniqueOrThrow({ where: { id: old.id } })).status).toBe('CANCELED')
    expect((await prisma.liveSession.findUniqueOrThrow({ where: { id: recent.id } })).status).toBe('SCHEDULED')
  })
})
