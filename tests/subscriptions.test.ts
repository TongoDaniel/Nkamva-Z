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
  retryAutoRenewDebits,
} from '@/lib/subscriptions'
import { setTariff } from '@/lib/pricing'
import { fmtNumber } from '@/lib/format'
import * as email from '@/lib/email'
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
  // Une modification tarifaire n'atteint un abonné qu'à sa DEUXIÈME échéance :
  // celle qui suit immédiatement la publication reconduit le prix en cours.
  it('un nouveau tarif est reporté au 2e renouvellement, avec annonce et rappel', async () => {
    const { user, profile, admin } = await setupTrainer()
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: TARIFF_FROM(), actorId: admin.id })

    // 1re période : aucune période derrière ce formateur, donc rien à reporter.
    const firstRun = await renewDueSubscriptions()
    expect(firstRun.deferred).toBe(0)
    const first = await prisma.subscriptionCharge.findFirstOrThrow({
      where: { trainerId: profile.id }, orderBy: { periodStart: 'desc' },
    })
    expect(first.listPriceFcfa).toBe(5_000)
    expect(first.tariffDeferred).toBe(false)

    // La grille à 5 000 était déjà une annonce : passer de la gratuité à un
    // tarif payant est le changement qui mérite le plus d'être annoncé.
    const announcements = { where: { userId: user.id, type: 'SUBSCRIPTION_TARIFF_CHANGE_ANNOUNCED' } }
    expect(await prisma.notification.count(announcements)).toBe(1)

    // Le Super-admin pose une nouvelle grille : l'annonce part immédiatement.
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 9_000, validFrom: TARIFF_FROM(), actorId: admin.id })
    const announced = await prisma.notification.findMany({
      ...announcements, orderBy: { createdAt: 'desc' },
    })
    expect(announced).toHaveLength(2)
    // `fmtNumber` et non « 9 000 » écrit à la main : le séparateur de milliers
    // fr-FR est une espace insécable étroite, invisible dans un littéral.
    expect(announced[0].body).toContain(fmtNumber(9_000))

    // 2e échéance — reconduction : le formateur paie encore l'ancien prix, et
    // reçoit le rappel qui annonce la date exacte de la bascule.
    const secondRun = await renewDueSubscriptions(new Date(first.periodEnd.getTime() + 1_000))
    expect(secondRun.deferred).toBe(1)
    const second = await prisma.subscriptionCharge.findFirstOrThrow({
      where: { trainerId: profile.id }, orderBy: { periodStart: 'desc' },
    })
    expect(second.listPriceFcfa).toBe(5_000)
    expect(second.tariffDeferred).toBe(true)
    expect(
      await prisma.notification.count({
        where: { userId: user.id, type: 'SUBSCRIPTION_TARIFF_CHANGE_REMINDER' },
      }),
    ).toBe(1)

    // 3e échéance — le report est consommé, la grille s'applique.
    const thirdRun = await renewDueSubscriptions(new Date(second.periodEnd.getTime() + 1_000))
    expect(thirdRun.deferred).toBe(0)
    const third = await prisma.subscriptionCharge.findFirstOrThrow({
      where: { trainerId: profile.id }, orderBy: { periodStart: 'desc' },
    })
    expect(third.listPriceFcfa).toBe(9_000)
    expect(third.tariffDeferred).toBe(false)

    // 4e échéance — grille inchangée depuis : plus aucun report, plus aucun rappel.
    const fourthRun = await renewDueSubscriptions(new Date(third.periodEnd.getTime() + 1_000))
    expect(fourthRun.deferred).toBe(0)
    expect(
      await prisma.notification.count({
        where: { userId: user.id, type: 'SUBSCRIPTION_TARIFF_CHANGE_REMINDER' },
      }),
    ).toBe(1)
  })

  // -------------------------------------------------------------------------
  // L'email double la notification, et lui seul est désactivable. Couper l'un
  // ne doit jamais couper l'autre : la notification est la trace.
  it("l'annonce et le rappel partent par email, sauf si le formateur les a coupés", async () => {
    const { user, profile, admin } = await setupTrainer()
    const sent = vi.spyOn(email, 'sendEmail').mockResolvedValue(undefined)

    try {
      await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: TARIFF_FROM(), actorId: admin.id })
      expect(sent).toHaveBeenCalledTimes(1)
      expect(sent.mock.calls[0][0].to).toBe(user.email)
      // L'email dit lui-même comment le couper.
      expect(sent.mock.calls[0][0].html).toContain('Profil &amp; paramètres')

      await renewDueSubscriptions()
      const first = await prisma.subscriptionCharge.findFirstOrThrow({
        where: { trainerId: profile.id }, orderBy: { periodStart: 'desc' },
      })

      // Le formateur coupe les emails d'information.
      await prisma.user.update({ where: { id: user.id }, data: { subscriptionNoticeEmails: false } })
      sent.mockClear()

      await setTariff({ cadence: 'MONTHLY', amountFcfa: 9_000, validFrom: TARIFF_FROM(), actorId: admin.id })
      const deferredRun = await renewDueSubscriptions(new Date(first.periodEnd.getTime() + 1_000))
      expect(deferredRun.deferred).toBe(1)

      // Aucun email, mais l'annonce ET le rappel sont bien dans le compte.
      expect(sent).not.toHaveBeenCalled()
      expect(
        await prisma.notification.count({
          where: { userId: user.id, type: 'SUBSCRIPTION_TARIFF_CHANGE_ANNOUNCED' },
        }),
      ).toBe(2)
      expect(
        await prisma.notification.count({
          where: { userId: user.id, type: 'SUBSCRIPTION_TARIFF_CHANGE_REMINDER' },
        }),
      ).toBe(1)
    } finally {
      sent.mockRestore()
    }
  })

  // Une adresse qui échoue ne doit pas priver les suivants de l'annonce.
  it("un envoi en échec n'empêche ni la notification ni les autres destinataires", async () => {
    const { user, admin } = await setupTrainer()
    const other = await prisma.user.create({ data: { email: 'autre@test.com', role: 'TRAINER' } })
    await prisma.trainerProfile.create({ data: { userId: other.id } })

    const sent = vi
      .spyOn(email, 'sendEmail')
      .mockRejectedValueOnce(new Error('Email send failed: invalid recipient'))
      .mockResolvedValue(undefined)

    try {
      await setTariff({ cadence: 'MONTHLY', amountFcfa: 7_000, validFrom: TARIFF_FROM(), actorId: admin.id })
      expect(sent).toHaveBeenCalledTimes(2)
    } finally {
      sent.mockRestore()
    }

    // Les deux formateurs ont leur notification, y compris celui dont l'email
    // a échoué : `notifyWithEmail` écrit la trace avant de tenter l'envoi.
    for (const id of [user.id, other.id]) {
      expect(
        await prisma.notification.count({
          where: { userId: id, type: 'SUBSCRIPTION_TARIFF_CHANGE_ANNOUNCED' },
        }),
      ).toBe(1)
    }
  })

  // Un formateur qui souscrit APRÈS la publication paie le nouveau tarif tout
  // de suite : le report protège un engagement en cours, pas une inscription.
  it('un nouvel abonné souscrit directement au tarif en vigueur', async () => {
    const { admin } = await setupTrainer()
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 9_000, validFrom: TARIFF_FROM(), actorId: admin.id })

    const newcomer = await prisma.user.create({ data: { email: 'nouveau@test.com', role: 'TRAINER' } })
    const newProfile = await prisma.trainerProfile.create({ data: { userId: newcomer.id } })
    await prisma.$transaction((tx) => openFirstPeriod(tx, newProfile.id))

    const charge = await prisma.subscriptionCharge.findFirstOrThrow({ where: { trainerId: newProfile.id } })
    expect(charge.listPriceFcfa).toBe(9_000)
    expect(charge.tariffDeferred).toBe(false)
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
  // Le constat par Finances reste un geste valable — ce n'est simplement plus
  // le seul : le prélèvement sur solde (arbitrage 8) lève aussi un impayé.
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

  // =========================================================================
  // Renouvellement automatique — arbitrages 8 et 9
  // =========================================================================

  /** Dote le formateur d'un solde et, éventuellement, du consentement. */
  async function withWallet(trainerId: string, balance: number, autoRenew = true) {
    await prisma.wallet.create({ data: { trainerId, balance } })
    await prisma.trainerProfile.update({ where: { id: trainerId }, data: { autoRenew } })
  }

  it('inactif par défaut : rien n\'est prélevé, même avec un solde large', async () => {
    const { profile, admin } = await setupTrainer()
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: TARIFF_FROM(), actorId: admin.id })
    await prisma.wallet.create({ data: { trainerId: profile.id, balance: 100_000 } })

    const result = await renewDueSubscriptions()

    // Arbitrage 8 — le prélèvement est un consentement, pas un défaut.
    expect(result.debited).toBe(0)
    expect(result.pastDue).toBe(1)
    expect(await prisma.walletDebit.count()).toBe(0)
    expect((await prisma.wallet.findFirstOrThrow({ where: { trainerId: profile.id } })).balance).toBe(100_000)
  })

  it('actif et solde suffisant : la période est réglée à l\'échéance même', async () => {
    const { profile, admin } = await setupTrainer()
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: TARIFF_FROM(), actorId: admin.id })
    await withWallet(profile.id, 20_000)

    const result = await renewDueSubscriptions()

    expect(result.debited).toBe(1)
    // Un formateur prélevé n'est jamais passé par l'impayé.
    expect(result.pastDue).toBe(0)
    const charge = await prisma.subscriptionCharge.findFirstOrThrow({ where: { trainerId: profile.id } })
    expect(charge.status).toBe('SETTLED')
    const after = await prisma.trainerProfile.findUniqueOrThrow({ where: { id: profile.id } })
    expect(after.subscriptionStatus).toBe('ACTIVE')
    expect(after.subscriptionPastDueAt).toBeNull()
  })

  it('actif mais solde insuffisant : impayé, et le message dit pourquoi', async () => {
    const { profile, user, admin } = await setupTrainer()
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: TARIFF_FROM(), actorId: admin.id })
    await withWallet(profile.id, 1_200)

    const result = await renewDueSubscriptions()

    expect(result.debited).toBe(0)
    expect(result.pastDue).toBe(1)
    const notice = await prisma.notification.findFirstOrThrow({
      where: { userId: user.id, type: 'SUBSCRIPTION_PAYMENT_DUE' },
    })
    // Annoncer un simple « à régler » à qui croyait être prélevé serait
    // incompréhensible : le solde qui a manqué doit être nommé.
    // `fmtNumber` et non une espace littérale : le séparateur de milliers est
    // insécable, et l'écrire à la main rend le test faux pour rien.
    expect(notice.body).toContain(fmtNumber(1_200))
    expect(notice.body).toContain('retenté chaque nuit')
  })

  it('le rejeu nocturne solde l\'échéance dès que le solde se garnit', async () => {
    const { profile, user, admin } = await setupTrainer()
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: TARIFF_FROM(), actorId: admin.id })
    await withWallet(profile.id, 1_000)
    await renewDueSubscriptions()

    // Rien n'a changé : le rejeu ne prélève pas ce qui n'est pas là.
    expect(await retryAutoRenewDebits()).toMatchObject({ debited: 0 })

    // Une vente tombe. Le formateur ne fait rien.
    await prisma.wallet.update({
      where: { trainerId: profile.id }, data: { balance: 12_000 },
    })
    const retry = await retryAutoRenewDebits()

    expect(retry).toMatchObject({ debited: 1, amountFcfa: 5_000 })
    const charge = await prisma.subscriptionCharge.findFirstOrThrow({ where: { trainerId: profile.id } })
    expect(charge.status).toBe('SETTLED')
    expect((await prisma.trainerProfile.findUniqueOrThrow({ where: { id: profile.id } })).subscriptionStatus)
      .toBe('ACTIVE')
    await prisma.notification.findFirstOrThrow({
      where: { userId: user.id, type: 'SUBSCRIPTION_PAYMENT_DEBITED' },
    })
  })

  it('le rejeu ne prélève rien sans consentement, ni sur un abonnement résilié', async () => {
    const { profile, admin } = await setupTrainer()
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: TARIFF_FROM(), actorId: admin.id })
    await withWallet(profile.id, 50_000, false)
    await renewDueSubscriptions()

    expect(await retryAutoRenewDebits()).toMatchObject({ attempted: 0, debited: 0 })

    // Consentement donné, mais résiliation en cours : la dette d'une période
    // consommée se récupère au terme, par un autre chemin (arbitrage 10).
    await prisma.trainerProfile.update({
      where: { id: profile.id },
      data: { autoRenew: true, subscriptionCanceledAt: new Date() },
    })
    expect(await retryAutoRenewDebits()).toMatchObject({ attempted: 0, debited: 0 })
  })

  it('rejouer le job ne prélève pas deux fois la même période', async () => {
    const { profile, admin } = await setupTrainer()
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: TARIFF_FROM(), actorId: admin.id })
    await withWallet(profile.id, 20_000)
    await renewDueSubscriptions()

    await retryAutoRenewDebits()
    await retryAutoRenewDebits()

    expect(await prisma.walletDebit.count()).toBe(1)
    expect((await prisma.wallet.findFirstOrThrow({ where: { trainerId: profile.id } })).balance).toBe(15_000)
  })

  it('une période offerte ne prélève rien, même consentement donné', async () => {
    const { profile } = await setupTrainer()
    await withWallet(profile.id, 20_000)

    const result = await renewDueSubscriptions()

    expect(result.waived).toBe(1)
    expect(result.debited).toBe(0)
    expect(await prisma.walletDebit.count()).toBe(0)
  })

  it('le prélèvement porte sur le total, paliers de stockage compris', async () => {
    const { profile, admin } = await setupTrainer()
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: TARIFF_FROM(), actorId: admin.id })
    await setTariff({
      kind: 'STORAGE_TIER', cadence: 'MONTHLY', amountFcfa: 2_000,
      validFrom: TARIFF_FROM(), actorId: admin.id,
    })
    await prisma.trainerProfile.update({ where: { id: profile.id }, data: { storageTiers: 2 } })
    await withWallet(profile.id, 20_000)

    await renewDueSubscriptions()

    // Arbitrage 69 — une seule ligne à régler : 5 000 + 2 × 2 000.
    const debit = await prisma.walletDebit.findFirstOrThrow({ where: { trainerId: profile.id } })
    expect(debit.amountFcfa).toBe(9_000)
    expect((await prisma.wallet.findFirstOrThrow({ where: { trainerId: profile.id } })).balance).toBe(11_000)
  })
})
