// ==========================================================================
// Règlement tardif d'un abonnement — campagne du 12 octobre 2026, M2
// ==========================================================================
// Mariam, suspendue le 25 janvier, règle le 10 mars l'échéance de janvier. Le
// règlement la remettait `ACTIVE` sur une fin de période au 10 février, déjà
// passée. La nuit même : nouvelle échéance pour le 10 février → 10 mars — le
// mois où elle était suspendue et ne pouvait rien vendre —, puis suspension
// immédiate, les « 14 jours » étant comptés depuis le 10 février. 5 000 FCFA
// pour seize heures d'activité.
//
// Le règlement réel horodate « maintenant » : le scénario est donc décalé dans
// le passé, et les tâches planifiées jouées aux dates voulues.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { initiateSubscriptionPayment } from '@/lib/subscription-payment'
import { renewDueSubscriptions, suspendOverdueSubscriptions, SUBSCRIPTION_GRACE_DAYS } from '@/lib/subscriptions'

const DAY = 86_400_000

describe('M2 — un règlement tardif ne re-suspend pas', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  it('sortir d\'une suspension ne facture pas les mois suspendus, ni ne re-suspend la nuit même', async () => {
    const now = Date.now()
    const user = await prisma.user.create({ data: { email: 'mariam@test.com', role: 'TRAINER' } })
    const admin = await prisma.user.create({ data: { email: 'sa@test.com', role: 'ADMIN', adminRole: 'SUPER_ADMIN' } })
    const trainer = await prisma.trainerProfile.create({
      data: { userId: user.id, approvedAt: new Date(now - 90 * DAY), subscriptionCurrentPeriodEnd: new Date(now - 45 * DAY) },
    })
    // Écrit en base : `setTariff` refuse, à juste titre, une date de prise
    // d'effet passée. Le scénario a besoin d'un tarif déjà en vigueur.
    await prisma.platformTariff.create({
      data: { kind: 'SUBSCRIPTION', cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: new Date(now - 60 * DAY), createdById: admin.id },
    })

    // Il y a 45 jours : l'échéance s'ouvre et reste impayée.
    await renewDueSubscriptions(new Date(now - 45 * DAY + 1000))
    // Le délai de grâce passe : suspension.
    await suspendOverdueSubscriptions(new Date(now - 45 * DAY + (SUBSCRIPTION_GRACE_DAYS + 1) * DAY))
    expect((await prisma.trainerProfile.findUniqueOrThrow({ where: { id: trainer.id } })).subscriptionStatus).toBe('SUSPENDED')

    // Aujourd'hui, elle règle l'arriéré.
    const paidAt = Date.now()
    await initiateSubscriptionPayment(trainer.id, user.id, 'STRIPE')
    const reactivated = await prisma.trainerProfile.findUniqueOrThrow({ where: { id: trainer.id } })
    expect(reactivated.subscriptionStatus).toBe('ACTIVE')
    // La période suivante part du règlement, pas de la date déjà passée.
    expect(reactivated.subscriptionCurrentPeriodEnd!.getTime()).toBeGreaterThanOrEqual(paidAt - 1000)

    // La nuit suivante, les tâches passent dans l'ordre du cron.
    const night = new Date(Date.now() + 60_000)
    await renewDueSubscriptions(night)
    await suspendOverdueSubscriptions(night)

    const after = await prisma.trainerProfile.findUniqueOrThrow({ where: { id: trainer.id } })
    expect(after.subscriptionStatus).not.toBe('SUSPENDED')

    // Aucune échéance ne couvre la suspension : la nouvelle commence au règlement.
    const charges = await prisma.subscriptionCharge.findMany({
      where: { trainerId: trainer.id }, orderBy: { periodStart: 'asc' },
    })
    const opened = charges[charges.length - 1]
    expect(opened.periodStart.getTime()).toBeGreaterThanOrEqual(paidAt - 1000)
    expect(charges.filter((c) => c.periodStart.getTime() < paidAt - 1000)).toHaveLength(1)
  })
})
