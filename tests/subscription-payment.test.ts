// ==========================================================================
// Règlement manuel d'une échéance — arbitrages 11 et 12
// ==========================================================================
// Le formateur recevait « votre abonnement est à régler » sans aucun bouton
// pour le régler. Ces tests tiennent les deux points délicats : l'arriéré se
// règle d'un bloc, et la republication ne remet au catalogue **que** ce que la
// suspension en avait retiré.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  getSubscriptionPaymentState, initiateSubscriptionPayment,
  settleSubscriptionPayment, failSubscriptionPayment, openReactivationCharge,
} from '@/lib/subscription-payment'
import {
  renewDueSubscriptions, suspendOverdueSubscriptions,
  periodEndFor, SUBSCRIPTION_GRACE_DAYS,
} from '@/lib/subscriptions'
import { setTariff } from '@/lib/pricing'

const TARIFF_FROM = () => new Date(Date.now() - 30_000)

describe("Règlement manuel d'une échéance", () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup() {
    const user = await prisma.user.create({ data: { email: 'formateur@test.com', role: 'TRAINER' } })
    const trainer = await prisma.trainerProfile.create({
      data: {
        userId: user.id, approvedAt: new Date(),
        subscriptionCurrentPeriodEnd: new Date(Date.now() - 1000),
      },
    })
    const admin = await prisma.user.create({
      data: { email: 'sa@test.com', role: 'ADMIN', adminRole: 'SUPER_ADMIN' },
    })
    return { user, trainer, admin }
  }

  function course(trainerId: string, slug: string, status: string, suspended = false) {
    return prisma.course.create({
      data: {
        trainerId, slug, title: 'Ressource', blurb: 'Accroche', description: 'Description',
        category: 'dev', format: 'video', priceFcfa: 10_000, status,
        catalogSuspendedAt: suspended ? new Date() : null,
      },
    })
  }

  /** Une période due de plus, antérieure à celles déjà ouvertes. */
  function olderCharge(trainerId: string, amountDueFcfa: number, daysAgo: number) {
    const periodStart = new Date(Date.now() - daysAgo * 86_400_000)
    return prisma.subscriptionCharge.create({
      data: {
        trainerId, cadence: 'MONTHLY',
        periodStart, periodEnd: periodEndFor(periodStart, 'MONTHLY'),
        listPriceFcfa: amountDueFcfa, amountDueFcfa, status: 'DUE',
      },
    })
  }

  // -------------------------------------------------------------------------
  it("l'arriéré se lit d'un bloc, les plus anciennes périodes d'abord", async () => {
    const { trainer, admin } = await setup()
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: TARIFF_FROM(), actorId: admin.id })
    await renewDueSubscriptions()
    const ancienne = await olderCharge(trainer.id, 4_000, 60)

    const state = await getSubscriptionPaymentState(trainer.id)

    expect(state?.amountFcfa).toBe(9_000)
    expect(state?.chargeIds[0]).toBe(ancienne.id)
    expect(state?.chargeIds).toHaveLength(2)
  })

  it("rien à régler : l'état est nul plutôt qu'un montant à zéro", async () => {
    const { trainer } = await setup()
    // Période offerte : elle n'est pas due, elle est offerte.
    await renewDueSubscriptions()

    expect(await getSubscriptionPaymentState(trainer.id)).toBeNull()
  })

  it('le règlement solde toutes les périodes couvertes', async () => {
    const { trainer, user, admin } = await setup()
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: TARIFF_FROM(), actorId: admin.id })
    await renewDueSubscriptions()
    await olderCharge(trainer.id, 4_000, 60)

    // Sans fournisseur configuré, `openProviderPayment` règle en simulation :
    // c'est ce que `ALLOW_PAYMENT_SIMULATION` autorise en test.
    await initiateSubscriptionPayment(trainer.id, user.id, 'STRIPE')

    expect(await prisma.subscriptionCharge.count({ where: { trainerId: trainer.id, status: 'DUE' } })).toBe(0)
    const after = await prisma.trainerProfile.findUniqueOrThrow({ where: { id: trainer.id } })
    expect(after.subscriptionStatus).toBe('ACTIVE')
    expect(after.subscriptionPastDueAt).toBeNull()
  })

  it("une période ouverte après le règlement n'est pas couverte par lui", async () => {
    const { trainer, user, admin } = await setup()
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: TARIFF_FROM(), actorId: admin.id })
    await renewDueSubscriptions()

    const payment = await prisma.subscriptionPayment.create({
      data: {
        trainerId: trainer.id, amountFcfa: 5_000,
        chargeIds: (await prisma.subscriptionCharge.findMany({
          where: { trainerId: trainer.id }, select: { id: true },
        })).map((c) => c.id),
        provider: 'STRIPE', providerTransactionId: 'pi_late',
      },
    })
    // Le renouvellement de la nuit ouvre une période que ce règlement ne
    // couvre pas : il n'a pas été payé pour elle.
    const suivante = await olderCharge(trainer.id, 5_000, -30)

    await settleSubscriptionPayment('pi_late', 'STRIPE')

    expect((await prisma.subscriptionCharge.findUniqueOrThrow({ where: { id: suivante.id } })).status).toBe('DUE')
    expect((await prisma.trainerProfile.findUniqueOrThrow({ where: { id: trainer.id } })).subscriptionStatus)
      .not.toBe('ACTIVE')
    expect(payment.chargeIds).toHaveLength(1)
  })

  // -------------------------------------------------------------------------
  // Arbitrage 12 — le règlement republie, mais **seulement** ce que la
  // suspension avait retiré.
  it('le règlement remet au catalogue ce que la suspension avait retiré', async () => {
    const { trainer, user, admin } = await setup()
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: TARIFF_FROM(), actorId: admin.id })
    const publiee = await course(trainer.id, 'publiee', 'published')
    const rangee = await course(trainer.id, 'rangee', 'archived')

    await renewDueSubscriptions()
    await prisma.trainerProfile.update({
      where: { id: trainer.id },
      data: { subscriptionPastDueAt: new Date(Date.now() - (SUBSCRIPTION_GRACE_DAYS + 1) * 86_400_000) },
    })
    await suspendOverdueSubscriptions()

    expect((await prisma.course.findUniqueOrThrow({ where: { id: publiee.id } })).status).toBe('archived')

    await initiateSubscriptionPayment(trainer.id, user.id, 'STRIPE')

    // Celle-ci revient : elle était en vente, on l'en a retirée.
    expect((await prisma.course.findUniqueOrThrow({ where: { id: publiee.id } })).status).toBe('published')
    // Celle-là ne revient pas : le formateur l'avait rangée lui-même. Sans le
    // marqueur, `status = 'archived'` les aurait confondues.
    expect((await prisma.course.findUniqueOrThrow({ where: { id: rangee.id } })).status).toBe('archived')
    expect((await prisma.course.findUniqueOrThrow({ where: { id: publiee.id } })).catalogSuspendedAt).toBeNull()
  })

  // -------------------------------------------------------------------------
  it('une seule tentative en vol à la fois', async () => {
    const { trainer, user, admin } = await setup()
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: TARIFF_FROM(), actorId: admin.id })
    await renewDueSubscriptions()

    await prisma.subscriptionPayment.create({
      data: {
        trainerId: trainer.id, amountFcfa: 5_000, chargeIds: [],
        provider: 'STRIPE', providerTransactionId: 'pi_vol', providerStatus: 'PENDING',
      },
    })

    await expect(initiateSubscriptionPayment(trainer.id, user.id, 'STRIPE'))
      .rejects.toThrow('PAYMENT_IN_PROGRESS')
  })

  it('rejouer le webhook ne solde pas deux fois', async () => {
    const { trainer, admin } = await setup()
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: TARIFF_FROM(), actorId: admin.id })
    await renewDueSubscriptions()
    const charge = await prisma.subscriptionCharge.findFirstOrThrow({ where: { trainerId: trainer.id } })
    await prisma.subscriptionPayment.create({
      data: {
        trainerId: trainer.id, amountFcfa: 5_000, chargeIds: [charge.id],
        provider: 'PAWAPAY', providerTransactionId: 'dep_1',
      },
    })

    expect(await settleSubscriptionPayment('dep_1', 'PAWAPAY')).toMatchObject({ settled: true })
    expect(await settleSubscriptionPayment('dep_1', 'PAWAPAY')).toEqual({ settled: false })
  })

  it("un identifiant inconnu laisse les autres chemins intacts", async () => {
    // Les webhooks appellent les trois chemins sans savoir lequel est
    // concerné : celui-ci doit passer son tour sans rien casser.
    expect(await settleSubscriptionPayment('pi_achat_ordinaire', 'STRIPE')).toEqual({ settled: false })
    expect(await failSubscriptionPayment('pi_achat_ordinaire', 'X')).toBe(false)
  })

  it("l'échec libère la place pour une nouvelle tentative", async () => {
    const { trainer, user, admin } = await setup()
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: TARIFF_FROM(), actorId: admin.id })
    await renewDueSubscriptions()
    await prisma.subscriptionPayment.create({
      data: {
        trainerId: trainer.id, amountFcfa: 5_000, chargeIds: [],
        provider: 'PAWAPAY', providerTransactionId: 'dep_ko', providerStatus: 'PENDING',
      },
    })

    expect(await failSubscriptionPayment('dep_ko', 'INSUFFICIENT_BALANCE')).toBe(true)

    // Sans ce chemin, le garde-fou « une seule tentative » l'aurait laissé en
    // impayé jusqu'à la suspension, sans recours.
    const state = await getSubscriptionPaymentState(trainer.id)
    expect(state?.pending).toBe(false)
    expect(state?.lastFailureCode).toBe('INSUFFICIENT_BALANCE')
    await expect(initiateSubscriptionPayment(trainer.id, user.id, 'STRIPE')).resolves.toBeTruthy()
  })

  // =========================================================================
  // Réactivation d'un ancien formateur — arbitrage 7
  // =========================================================================

  /** Un formateur parti : espace en état de solde, ressources retirées. */
  async function departed(trainerId: string) {
    await prisma.trainerProfile.update({
      where: { id: trainerId },
      data: { subscriptionStatus: 'CANCELED', subscriptionCanceledAt: new Date(Date.now() - 86_400_000) },
    })
  }

  it("l'ancien formateur ne repasse pas par une candidature", async () => {
    const { trainer, admin } = await setup()
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: TARIFF_FROM(), actorId: admin.id })
    await departed(trainer.id)

    const charge = await openReactivationCharge(trainer.id)

    expect(charge.amountDueFcfa).toBe(5_000)
    expect(charge.status).toBe('DUE')
    // Son dossier reste approuvé : aucun réexamen.
    expect(await prisma.trainerApplication.count()).toBe(0)
  })

  it('le règlement rouvre son espace et remet ses pièces en vérification', async () => {
    const { trainer, user, admin } = await setup()
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: TARIFF_FROM(), actorId: admin.id })
    const retiree = await course(trainer.id, 'retiree', 'archived', true)
    await prisma.payoutMethod.create({
      data: {
        trainerId: trainer.id, type: 'BANK_IBAN', accountNature: 'INDIVIDUAL',
        verifiedLegalNameAtCreation: 'Marie Formatrice', trainerEmailSnapshot: 'formateur@test.com',
        holderName: 'Marie Formatrice',
        iban: 'FR7630006000011234567890189', verificationStatus: 'MANUAL_VERIFIED', isActive: true,
      },
    })
    await departed(trainer.id)
    await openReactivationCharge(trainer.id)

    await initiateSubscriptionPayment(trainer.id, user.id, 'STRIPE')

    const after = await prisma.trainerProfile.findUniqueOrThrow({ where: { id: trainer.id } })
    expect(after.subscriptionStatus).toBe('ACTIVE')
    expect(after.subscriptionCanceledAt).toBeNull()
    expect(after.subscriptionCurrentPeriodEnd!.getTime()).toBeGreaterThan(Date.now())

    // Ses pièces ont pu expirer pendant son absence.
    const method = await prisma.payoutMethod.findFirstOrThrow({ where: { trainerId: trainer.id } })
    expect(method.verificationStatus).toBe('PENDING_REVIEW')

    // Ses anciennes ressources **restent archivées** : il les republie lui-même.
    const resource = await prisma.course.findUniqueOrThrow({ where: { id: retiree.id } })
    expect(resource.status).toBe('archived')
    // Le marqueur part quand même : un impayé futur ne doit pas republier ce
    // qu'il aura choisi de laisser hors catalogue.
    expect(resource.catalogSuspendedAt).toBeNull()
  })

  it("une réactivation abandonnée ne rouvre pas une seconde période", async () => {
    const { trainer, admin } = await setup()
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: TARIFF_FROM(), actorId: admin.id })
    await departed(trainer.id)

    const first = await openReactivationCharge(trainer.id)
    const second = await openReactivationCharge(trainer.id)

    expect(second.id).toBe(first.id)
    expect(await prisma.subscriptionCharge.count({ where: { trainerId: trainer.id } })).toBe(1)
  })

  it("un formateur en activité ne se réactive pas", async () => {
    const { trainer } = await setup()

    await expect(openReactivationCharge(trainer.id)).rejects.toThrow('NOT_ENDED')
  })
})
