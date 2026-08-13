// ==========================================================================
// Préavis — arbitrages 96, 103
// ==========================================================================
// Ce qui est vérifié ici tient en une phrase : **un préavis part une fois**.
// L'ancien job d'alerte des purges renotifiait tous les jours pendant trente
// jours ; c'est ce défaut-là que ces tests empêchent de revenir.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  noticeEndingGiftMemberships, noticeTariffSwitch,
  ACCESS_END_NOTICE_DAYS, TARIFF_SWITCH_NOTICE_DAYS,
} from '@/lib/notices'

const DAY = 86_400_000

describe('Préavis', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function community() {
    const trainerUser = await prisma.user.create({
      data: { email: 'formateur@test.com', role: 'TRAINER', fullName: 'Awa Sarr' },
    })
    const trainer = await prisma.trainerProfile.create({
      data: { userId: trainerUser.id, approvedAt: new Date() },
    })
    const created = await prisma.community.create({
      data: { trainerId: trainer.id, name: 'Les artisans', slug: 'artisans', priceFcfa: 5000 },
    })
    return { trainerUser, trainer, community: created }
  }

  /** Adhésion offerte : `provider` nul en est la définition (arbitrage 77). */
  async function gift(communityId: string, endsInDays: number) {
    const learner = await prisma.user.create({
      data: { email: `invite${Math.random()}@test.com`, role: 'LEARNER' },
    })
    await prisma.communitySubscription.create({
      data: {
        communityId, learnerId: learner.id, status: 'ACTIVE',
        periodStart: new Date(Date.now() - 30 * DAY),
        periodEnd: new Date(Date.now() + endsInDays * DAY),
        provider: null,
      },
    })
    return learner
  }

  it('arbitrage 103 — les mois offerts préviennent à J-7 puis à J-1', async () => {
    const { community: c } = await community()
    const septJours = await gift(c.id, 6.5)
    const demain = await gift(c.id, 0.5)
    const dansUnMois = await gift(c.id, 30)

    const { notified } = await noticeEndingGiftMemberships()
    expect(notified).toBe(2)

    expect(await prisma.notification.count({ where: { userId: septJours.id } })).toBe(1)
    expect(await prisma.notification.count({ where: { userId: demain.id } })).toBe(1)
    // Ni trop tôt : à trente jours, personne n'a besoin d'être prévenu.
    expect(await prisma.notification.count({ where: { userId: dansUnMois.id } })).toBe(0)
  })

  it('arbitrage 103 — rejouer le job ne prévient pas deux fois', async () => {
    const { community: c } = await community()
    const invite = await gift(c.id, 6.5)

    await noticeEndingGiftMemberships()
    const second = await noticeEndingGiftMemberships()

    expect(second.notified).toBe(0)
    expect(await prisma.notification.count({ where: { userId: invite.id } })).toBe(1)
  })

  it('une adhésion payante n\'est pas concernée : elle se reconduit', async () => {
    const { community: c } = await community()
    const learner = await prisma.user.create({ data: { email: 'payant@test.com', role: 'LEARNER' } })
    await prisma.communitySubscription.create({
      data: {
        communityId: c.id, learnerId: learner.id, status: 'ACTIVE',
        periodStart: new Date(Date.now() - 30 * DAY),
        periodEnd: new Date(Date.now() + 6.5 * DAY),
        provider: 'STRIPE',
      },
    })

    const { notified } = await noticeEndingGiftMemberships()
    expect(notified).toBe(0)
  })

  // --- Bascule tarifaire (arbitrage 96) ---

  async function tariff(amountFcfa: number, validFromDays: number, createdById: string) {
    return prisma.platformTariff.create({
      data: {
        kind: 'SUBSCRIPTION', cadence: 'MONTHLY', amountFcfa,
        validFrom: new Date(Date.now() + validFromDays * DAY),
        createdById,
      },
    })
  }

  it('arbitrage 96 — la fin de la gratuité se dit 60 jours avant', async () => {
    const { trainerUser, trainer } = await community()
    await prisma.trainerProfile.update({
      where: { id: trainer.id },
      data: { subscriptionCadence: 'MONTHLY', subscriptionStatus: 'ACTIVE' },
    })
    await tariff(0, -30, trainerUser.id)
    await tariff(9000, TARIFF_SWITCH_NOTICE_DAYS - 0.5, trainerUser.id)

    const { notified } = await noticeTariffSwitch()
    expect(notified).toBe(1)

    const notice = await prisma.notification.findFirstOrThrow({ where: { userId: trainerUser.id } })
    expect(notice.type).toBe('SUBSCRIPTION_TARIFF_SWITCH')

    // Rejouable sans doublon, comme le reste.
    expect((await noticeTariffSwitch()).notified).toBe(0)
  })

  it('arbitrage 96 — un simple changement de prix n\'est pas une fin de gratuité', async () => {
    const { trainerUser, trainer } = await community()
    await prisma.trainerProfile.update({
      where: { id: trainer.id },
      data: { subscriptionCadence: 'MONTHLY', subscriptionStatus: 'ACTIVE' },
    })
    // Déjà payant aujourd'hui : la hausse à venir se dit autrement (setTariff
    // annonce déjà les changements de grille), pas par une alerte de bascule.
    await tariff(9000, -30, trainerUser.id)
    await tariff(12000, TARIFF_SWITCH_NOTICE_DAYS - 0.5, trainerUser.id)

    expect((await noticeTariffSwitch()).notified).toBe(0)
  })

  it('les deux seuils de fin d\'accès sont bien 7 et 1', () => {
    expect([...ACCESS_END_NOTICE_DAYS]).toEqual([7, 1])
  })
})
