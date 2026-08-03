// ==========================================================================
// Cycle de vie de l'abonnement formateur — décisions 52, 56, 61, 68
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prisma, cleanDatabase } from './setup'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
import { getServerSession } from 'next-auth'
import { POST as settleRoute } from '@/app/api/admin/subscriptions/charges/[chargeId]/settle/route'

function signInAs(user: { id: string; role: string; adminRole?: string | null }) {
  vi.mocked(getServerSession).mockResolvedValue(
    { user: { email: 'x@test.com', trainerId: null, ...user } } as never,
  )
}

function jsonRequest(body: unknown) {
  return new Request('http://localhost/x', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}
import {
  renewDueSubscriptions, suspendOverdueSubscriptions, settleSubscriptionCharge,
  canTrainerWrite, openFirstPeriod, periodEndFor, SUBSCRIPTION_GRACE_DAYS,
} from '@/lib/subscriptions'
import { setTariff } from '@/lib/pricing'
import { createCourse, publishCourse } from '@/lib/courses'

/**
 * Un tarif s'applique aux périodes qui s'ouvrent **après** son entrée en
 * vigueur : une période qui commence avant lui ne le connaît pas (décision 59,
 * interdit de rétroactivité). Les périodes renouvelées ici démarrent une
 * seconde dans le passé, donc le tarif doit précéder ce point. `setTariff`
 * tolère une minute d'antériorité, précisément pour ce genre d'écart d'horloge.
 */
const TARIFF_FROM = () => new Date(Date.now() - 30_000)

describe('Abonnement formateur — cycle de vie', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setupTrainer(opts: { periodEnd?: Date } = {}) {
    const user = await prisma.user.create({ data: { email: 'formateur@test.com', role: 'TRAINER' } })
    const profile = await prisma.trainerProfile.create({
      data: {
        userId: user.id,
        subscriptionCurrentPeriodEnd: opts.periodEnd ?? new Date(Date.now() - 1000),
      },
    })
    const admin = await prisma.user.create({
      data: { email: 'super@test.com', role: 'ADMIN', adminRole: 'SUPER_ADMIN' },
    })
    return { user, profile, admin }
  }

  async function publishedCourse(trainerId: string, userId: string, slug = 'ressource') {
    return prisma.course.create({
      data: {
        trainerId, slug, title: 'Ressource', blurb: 'Accroche', description: 'Desc',
        category: 'Dev', format: 'video', priceFcfa: 20_000, status: 'published',
      },
    })
  }

  // -------------------------------------------------------------------------
  it('périodes : mensuelle et annuelle', () => {
    const start = new Date('2026-01-31T00:00:00Z')
    expect(periodEndFor(start, 'YEARLY').getUTCFullYear()).toBe(2027)
    expect(periodEndFor(new Date('2026-01-15T00:00:00Z'), 'MONTHLY').getUTCMonth()).toBe(1)
  })

  // -------------------------------------------------------------------------
  // Décision 56 — une période à zéro est offerte, pas due : la cohorte de
  // lancement ne doit jamais tomber en impayé.
  it('au tarif zéro, la période est offerte et le formateur reste actif', async () => {
    const { profile } = await setupTrainer()

    const result = await renewDueSubscriptions()
    expect(result.renewed).toBe(1)
    expect(result.waived).toBe(1)
    expect(result.pastDue).toBe(0)

    const charge = await prisma.subscriptionCharge.findFirstOrThrow({ where: { trainerId: profile.id } })
    expect(charge.status).toBe('WAIVED')
    expect(charge.amountDueFcfa).toBe(0)

    const after = await prisma.trainerProfile.findUniqueOrThrow({ where: { id: profile.id } })
    expect(after.subscriptionStatus).toBe('ACTIVE')
    expect(after.subscriptionPastDueAt).toBeNull()
  })

  it('au tarif payant, la période est due et le formateur passe en impayé', async () => {
    const { profile, admin } = await setupTrainer()
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: TARIFF_FROM(), actorId: admin.id })

    const result = await renewDueSubscriptions()
    expect(result.pastDue).toBe(1)

    const charge = await prisma.subscriptionCharge.findFirstOrThrow({ where: { trainerId: profile.id } })
    expect(charge.status).toBe('DUE')
    expect(charge.amountDueFcfa).toBe(5_000)

    const after = await prisma.trainerProfile.findUniqueOrThrow({ where: { id: profile.id } })
    expect(after.subscriptionStatus).toBe('PAST_DUE')
    expect(after.subscriptionPastDueAt).not.toBeNull()
  })

  // -------------------------------------------------------------------------
  // L'invariant qui compte : rejouer le job ne facture pas deux fois.
  it('rejouer le renouvellement ne crée pas de seconde période', async () => {
    const { profile, admin } = await setupTrainer()
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: TARIFF_FROM(), actorId: admin.id })

    const before = await prisma.trainerProfile.findUniqueOrThrow({ where: { id: profile.id } })
    const originalPeriodStart = before.subscriptionCurrentPeriodEnd!

    await renewDueSubscriptions()
    const charge = await prisma.subscriptionCharge.findFirstOrThrow({ where: { trainerId: profile.id } })

    // Deuxième passage : l'échéance est dans le futur, rien à faire.
    await renewDueSubscriptions()
    expect(await prisma.subscriptionCharge.count({ where: { trainerId: profile.id } })).toBe(1)

    // Rejeu franc : on remet l'échéance là où elle était, donc le job repart
    // sur EXACTEMENT la même période. C'est là que l'unicité doit tenir.
    await prisma.trainerProfile.update({
      where: { id: profile.id },
      data: { subscriptionCurrentPeriodEnd: originalPeriodStart },
    })
    await renewDueSubscriptions()

    const charges = await prisma.subscriptionCharge.findMany({ where: { trainerId: profile.id } })
    expect(charges).toHaveLength(1)
    expect(charges[0].id).toBe(charge.id)
  })

  // -------------------------------------------------------------------------
  // Décision 52 — la cadence souhaitée ne s'applique qu'au renouvellement.
  it('la cadence en attente prend effet à l\'échéance, pas avant', async () => {
    const { profile } = await setupTrainer({ periodEnd: new Date(Date.now() + 86_400_000) })
    await prisma.trainerProfile.update({
      where: { id: profile.id },
      data: { pendingCadence: 'YEARLY' },
    })

    // Échéance dans le futur : rien ne bouge.
    await renewDueSubscriptions()
    let current = await prisma.trainerProfile.findUniqueOrThrow({ where: { id: profile.id } })
    expect(current.subscriptionCadence).toBe('MONTHLY')
    expect(current.pendingCadence).toBe('YEARLY')

    await prisma.trainerProfile.update({
      where: { id: profile.id },
      data: { subscriptionCurrentPeriodEnd: new Date(Date.now() - 1000) },
    })
    await renewDueSubscriptions()

    current = await prisma.trainerProfile.findUniqueOrThrow({ where: { id: profile.id } })
    expect(current.subscriptionCadence).toBe('YEARLY')
    expect(current.pendingCadence).toBeNull()
  })

  // -------------------------------------------------------------------------
  // Décision 68 — les ressources sortent du catalogue, la lecture ne tombe pas.
  it('après le délai de grâce, les ressources sortent du catalogue', async () => {
    const { user, profile, admin } = await setupTrainer()
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: TARIFF_FROM(), actorId: admin.id })
    const course = await publishedCourse(profile.id, user.id)

    await renewDueSubscriptions()
    // Avant l'échéance du délai de grâce, rien ne se passe.
    expect((await suspendOverdueSubscriptions()).suspended).toBe(0)

    await prisma.trainerProfile.update({
      where: { id: profile.id },
      data: { subscriptionPastDueAt: new Date(Date.now() - (SUBSCRIPTION_GRACE_DAYS + 1) * 86_400_000) },
    })

    const result = await suspendOverdueSubscriptions()
    expect(result.suspended).toBe(1)
    expect(result.coursesArchived).toBe(1)

    expect((await prisma.course.findUniqueOrThrow({ where: { id: course.id } })).status).toBe('archived')
    expect(
      (await prisma.trainerProfile.findUniqueOrThrow({ where: { id: profile.id } })).subscriptionStatus,
    ).toBe('SUSPENDED')
  })

  it('un formateur suspendu ne peut plus écrire, mais rien d\'acheté n\'est touché', async () => {
    const { user, profile } = await setupTrainer()
    const course = await publishedCourse(profile.id, user.id)
    await prisma.trainerProfile.update({
      where: { id: profile.id },
      data: { subscriptionStatus: 'SUSPENDED' },
    })

    expect(await canTrainerWrite(profile.id)).toBe(false)

    await expect(
      createCourse(profile.id, user.id, {
        title: 'Nouvelle', blurb: 'Accroche', description: 'Desc',
        category: 'Dev', format: 'video', priceFcfa: 20_000,
      }),
    ).rejects.toThrow('SUBSCRIPTION_SUSPENDED')

    await prisma.course.update({ where: { id: course.id }, data: { status: 'draft' } })
    await expect(publishCourse(course.id, profile.id, user.id)).rejects.toThrow('SUBSCRIPTION_SUSPENDED')

    // L'achat, lui, n'est pas touché : la ressource existe toujours.
    expect(await prisma.course.count({ where: { trainerId: profile.id } })).toBe(1)
  })

  // -------------------------------------------------------------------------
  it('régler la dernière période ne solde pas un arriéré plus ancien', async () => {
    const { profile, admin } = await setupTrainer()
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: TARIFF_FROM(), actorId: admin.id })
    await renewDueSubscriptions()

    // Une seconde période impayée, plus ancienne.
    await prisma.subscriptionCharge.create({
      data: {
        trainerId: profile.id, cadence: 'MONTHLY',
        periodStart: new Date(Date.now() - 60 * 86_400_000),
        periodEnd: new Date(Date.now() - 30 * 86_400_000),
        listPriceFcfa: 5_000, amountDueFcfa: 5_000, status: 'DUE',
      },
    })

    const recent = await prisma.subscriptionCharge.findFirstOrThrow({
      where: { trainerId: profile.id }, orderBy: { periodStart: 'desc' },
    })
    await settleSubscriptionCharge(recent.id, { actorId: admin.id, actorRole: 'FINANCES' })

    // Il reste une période due : le formateur ne redevient pas ACTIVE.
    expect(
      (await prisma.trainerProfile.findUniqueOrThrow({ where: { id: profile.id } })).subscriptionStatus,
    ).toBe('PAST_DUE')
  })

  it('régler la dernière période due remet le formateur en actif', async () => {
    const { profile, admin } = await setupTrainer()
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: TARIFF_FROM(), actorId: admin.id })
    await renewDueSubscriptions()

    const charge = await prisma.subscriptionCharge.findFirstOrThrow({ where: { trainerId: profile.id } })
    await settleSubscriptionCharge(charge.id, { actorId: admin.id, actorRole: 'FINANCES' })

    const after = await prisma.trainerProfile.findUniqueOrThrow({ where: { id: profile.id } })
    expect(after.subscriptionStatus).toBe('ACTIVE')
    expect(after.subscriptionPastDueAt).toBeNull()
  })

  // -------------------------------------------------------------------------
  // Sans ce rattrapage, un profil créé avant la facturation resterait
  // invisible du renouvellement — donc jamais facturé, sans rien pour le dire.
  it('un profil sans période en reçoit une au premier passage du job', async () => {
    const user = await prisma.user.create({ data: { email: 'ancien@test.com', role: 'TRAINER' } })
    const profile = await prisma.trainerProfile.create({
      data: { userId: user.id, subscriptionCurrentPeriodEnd: null },
    })

    const result = await renewDueSubscriptions()
    expect(result.initialized).toBe(1)

    const after = await prisma.trainerProfile.findUniqueOrThrow({ where: { id: profile.id } })
    expect(after.subscriptionCurrentPeriodEnd).not.toBeNull()
    expect(await prisma.subscriptionCharge.count({ where: { trainerId: profile.id } })).toBe(1)

    // Deuxième passage : plus rien à rattraper.
    expect((await renewDueSubscriptions()).initialized).toBe(0)
  })

  // -------------------------------------------------------------------------
  // Le constat de règlement est le seul geste qui lève un impayé : aucun
  // prélèvement automatique n'existe.
  it('la route de constat est réservée à Finances et au Super-admin', async () => {
    const { profile, admin } = await setupTrainer()
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: TARIFF_FROM(), actorId: admin.id })
    await renewDueSubscriptions()
    const charge = await prisma.subscriptionCharge.findFirstOrThrow({ where: { trainerId: profile.id } })

    const moderator = await prisma.user.create({
      data: { email: 'mod@test.com', role: 'ADMIN', adminRole: 'MODERATION' },
    })
    signInAs({ id: moderator.id, role: 'ADMIN', adminRole: 'MODERATION' })
    const refused = await settleRoute(jsonRequest({}), {
      params: Promise.resolve({ chargeId: charge.id }),
    })
    expect(refused.status).toBe(403)

    signInAs({ id: admin.id, role: 'ADMIN', adminRole: 'FINANCES' })
    const ok = await settleRoute(jsonRequest({ reference: 'VIR-2026-0042' }), {
      params: Promise.resolve({ chargeId: charge.id }),
    })
    expect(ok.status).toBe(200)
    expect((await ok.json()).data.status).toBe('SETTLED')

    expect(
      (await prisma.trainerProfile.findUniqueOrThrow({ where: { id: profile.id } })).subscriptionStatus,
    ).toBe('ACTIVE')

    // Rejouer le constat ne double rien.
    const again = await settleRoute(jsonRequest({}), {
      params: Promise.resolve({ chargeId: charge.id }),
    })
    expect(again.status).toBe(409)
  })

  it('la première période est ouverte à l\'approbation, au tarif du moment', async () => {
    const user = await prisma.user.create({ data: { email: 'nouveau@test.com', role: 'TRAINER' } })
    const admin = await prisma.user.create({
      data: { email: 'sa@test.com', role: 'ADMIN', adminRole: 'SUPER_ADMIN' },
    })
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 3_000, validFrom: TARIFF_FROM(), actorId: admin.id })
    const profile = await prisma.trainerProfile.create({ data: { userId: user.id } })

    await prisma.$transaction(async (tx) => { await openFirstPeriod(tx, profile.id) })

    const charge = await prisma.subscriptionCharge.findFirstOrThrow({ where: { trainerId: profile.id } })
    expect(charge.amountDueFcfa).toBe(3_000)
    expect(charge.status).toBe('DUE')
    expect(
      (await prisma.trainerProfile.findUniqueOrThrow({ where: { id: profile.id } })).subscriptionCurrentPeriodEnd,
    ).not.toBeNull()
  })
})
