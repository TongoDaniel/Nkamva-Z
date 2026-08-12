// ==========================================================================
// Résiliation et état de solde — arbitrages 1 à 5, 10
// ==========================================================================
// `subscriptionCanceledAt` était lu comme filtre de non-renouvellement et
// n'était écrit par personne ; la valeur `CANCELED` de l'enum n'était utilisée
// nulle part. Ces tests couvrent les quatorze cas de la matrice « Résiliation »
// de `docs/abonnement-formateur.md`.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  cancelSubscription, resumeSubscription, endCanceledSubscriptions,
  renewDueSubscriptions, canTrainerWrite, periodEndFor,
} from '@/lib/subscriptions'
import { closeCommunity } from '@/lib/communities'
import {
  initiateMembershipPayment, activateMembershipForPurchase, renewDueMemberships,
} from '@/lib/memberships'
import { setTariff } from '@/lib/pricing'

const TARIFF_FROM = () => new Date(Date.now() - 30_000)

describe('Résiliation de l\'abonnement formateur', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup(opts: { periodEnd?: Date; balance?: number } = {}) {
    const user = await prisma.user.create({ data: { email: 'formateur@test.com', role: 'TRAINER' } })
    const trainer = await prisma.trainerProfile.create({
      data: {
        userId: user.id, approvedAt: new Date(),
        subscriptionCurrentPeriodEnd: opts.periodEnd ?? new Date(Date.now() + 20 * 86_400_000),
      },
    })
    await prisma.wallet.create({ data: { trainerId: trainer.id, balance: opts.balance ?? 0 } })
    const admin = await prisma.user.create({
      data: { email: 'sa@test.com', role: 'ADMIN', adminRole: 'SUPER_ADMIN' },
    })
    return { user, trainer, admin }
  }

  function course(trainerId: string, slug: string, status: string) {
    return prisma.course.create({
      data: {
        trainerId, slug, title: 'Ressource', blurb: 'Accroche', description: 'Description',
        category: 'dev', format: 'video', priceFcfa: 10_000, status,
      },
    })
  }

  async function community(trainerId: string, slug = 'salon') {
    return prisma.community.create({
      data: { trainerId, name: 'Salon', slug, priceFcfa: 5_000, commissionRate: 0.15 },
    })
  }

  async function join(communityId: string, learnerId: string) {
    const intent = await initiateMembershipPayment(communityId, learnerId, 'STRIPE')
    await prisma.$transaction(async (tx) => {
      await tx.purchase.update({
        where: { id: intent.purchaseId }, data: { providerStatus: 'SUCCEEDED' },
      })
      await activateMembershipForPurchase(tx, intent.purchaseId)
    })
  }

  // -------------------------------------------------------------------------
  // Ce que la résiliation fait, et surtout ce qu'elle ne fait pas
  // -------------------------------------------------------------------------

  it('ne coupe rien : la période court jusqu\'à son terme', async () => {
    const periodEnd = new Date(Date.now() + 20 * 86_400_000)
    const { user, trainer } = await setup({ periodEnd })
    const publiee = await course(trainer.id, 'publiee', 'published')

    const result = await cancelSubscription(trainer.id, user.id)

    expect(result.effectiveAt?.getTime()).toBe(periodEnd.getTime())
    // Rien n'est coupé aujourd'hui : ni le catalogue, ni le droit d'écrire.
    expect((await prisma.course.findUniqueOrThrow({ where: { id: publiee.id } })).status).toBe('published')
    expect(await canTrainerWrite(trainer.id)).toBe(true)
    const after = await prisma.trainerProfile.findUniqueOrThrow({ where: { id: trainer.id } })
    expect(after.subscriptionCanceledAt).not.toBeNull()
    expect(after.subscriptionStatus).toBe('ACTIVE')
  })

  it('efface la cadence en attente : la résiliation l\'emporte', async () => {
    const { user, trainer } = await setup()
    await prisma.trainerProfile.update({
      where: { id: trainer.id }, data: { pendingCadence: 'YEARLY' },
    })

    await cancelSubscription(trainer.id, user.id)

    expect((await prisma.trainerProfile.findUniqueOrThrow({ where: { id: trainer.id } })).pendingCadence)
      .toBeNull()
  })

  it('le renouvellement ignore un abonnement résilié', async () => {
    const { user, trainer, admin } = await setup({ periodEnd: new Date(Date.now() - 1000) })
    await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: TARIFF_FROM(), actorId: admin.id })
    await cancelSubscription(trainer.id, user.id)

    const result = await renewDueSubscriptions()

    expect(result.renewed).toBe(0)
    expect(await prisma.subscriptionCharge.count({ where: { trainerId: trainer.id } })).toBe(0)
  })

  it('résilier deux fois est refusé', async () => {
    const { user, trainer } = await setup()
    await cancelSubscription(trainer.id, user.id)
    await expect(cancelSubscription(trainer.id, user.id)).rejects.toThrow('ALREADY_CANCELED')
  })

  it('il peut revenir sur sa résiliation tant que la période court', async () => {
    const { user, trainer } = await setup()
    await cancelSubscription(trainer.id, user.id)

    await resumeSubscription(trainer.id, user.id)

    expect((await prisma.trainerProfile.findUniqueOrThrow({ where: { id: trainer.id } })).subscriptionCanceledAt)
      .toBeNull()
    await expect(resumeSubscription(trainer.id, user.id)).rejects.toThrow('NOT_CANCELED')
  })

  // -------------------------------------------------------------------------
  // Arbitrage 2 — la liberté de résilier est conditionnelle
  // -------------------------------------------------------------------------

  it('refusée tant que des membres payants courent', async () => {
    const { user, trainer } = await setup()
    const salon = await community(trainer.id)
    const membre = await prisma.user.create({ data: { email: 'membre@test.com', role: 'LEARNER' } })
    await join(salon.id, membre.id)

    await expect(cancelSubscription(trainer.id, user.id)).rejects.toThrow('ACTIVE_PAID_MEMBERS')
  })

  it('la sortie existe : fermer, attendre le terme, puis résilier', async () => {
    const { user, trainer } = await setup()
    const salon = await community(trainer.id)
    const membre = await prisma.user.create({ data: { email: 'membre@test.com', role: 'LEARNER' } })
    await join(salon.id, membre.id)

    // 1. Fermer. Rien n'est coupé, les adhésions vont à leur terme.
    await closeCommunity(salon.id, trainer.id, user.id)
    await expect(cancelSubscription(trainer.id, user.id)).rejects.toThrow('ACTIVE_PAID_MEMBERS')

    // 2. Le terme arrive. Jusqu'à un mois d'attente — c'est la conséquence
    // assumée de l'arbitrage 2, et l'écran doit l'annoncer.
    await prisma.communitySubscription.updateMany({
      where: { communityId: salon.id }, data: { periodEnd: new Date(Date.now() - 1000) },
    })
    await renewDueMemberships()

    // 3. Il peut partir.
    await expect(cancelSubscription(trainer.id, user.id)).resolves.toBeTruthy()
  })

  it('une adhésion offerte ne retient pas le formateur', async () => {
    const { user, trainer } = await setup()
    const salon = await community(trainer.id)
    const membre = await prisma.user.create({ data: { email: 'offert@test.com', role: 'LEARNER' } })
    await prisma.communitySubscription.create({
      data: {
        communityId: salon.id, learnerId: membre.id, status: 'ACTIVE',
        periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * 86_400_000),
        provider: null,
      },
    })

    await expect(cancelSubscription(trainer.id, user.id)).resolves.toBeTruthy()
  })

  // -------------------------------------------------------------------------
  // Le terme — arbitrages 3, 4, 5, 10
  // -------------------------------------------------------------------------

  it('au terme : hors catalogue, acheteurs inchangés, espace en état de solde', async () => {
    const { user, trainer } = await setup({ periodEnd: new Date(Date.now() - 1000) })
    const publiee = await course(trainer.id, 'publiee', 'published')
    const rangee = await course(trainer.id, 'rangee', 'archived')
    await cancelSubscription(trainer.id, user.id)

    const result = await endCanceledSubscriptions()

    expect(result.ended).toBe(1)
    expect(result.coursesWithdrawn).toBe(1)
    expect((await prisma.course.findUniqueOrThrow({ where: { id: publiee.id } })).status).toBe('archived')
    // Marquée : s'il revient et règle, c'est celle-ci qui reviendra.
    expect((await prisma.course.findUniqueOrThrow({ where: { id: publiee.id } })).catalogSuspendedAt)
      .not.toBeNull()
    // Celle qu'il avait rangée lui-même n'est pas marquée.
    expect((await prisma.course.findUniqueOrThrow({ where: { id: rangee.id } })).catalogSuspendedAt)
      .toBeNull()

    // État de solde : il ne publie plus, mais son espace n'est pas fermé.
    expect(await canTrainerWrite(trainer.id)).toBe(false)
    expect((await prisma.trainerProfile.findUniqueOrThrow({ where: { id: trainer.id } })).subscriptionStatus)
      .toBe('CANCELED')
  })

  it('les lives programmés après le terme sont annulés et les inscrits prévenus', async () => {
    const { user, trainer } = await setup({ periodEnd: new Date(Date.now() - 1000) })
    const salon = await community(trainer.id)
    const membre = await prisma.user.create({ data: { email: 'inscrit@test.com', role: 'LEARNER' } })
    await prisma.communitySubscription.create({
      data: {
        communityId: salon.id, learnerId: membre.id, status: 'ACTIVE',
        periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * 86_400_000),
        provider: null,
      },
    })
    const live = await prisma.liveSession.create({
      data: {
        communityId: salon.id, trainerId: trainer.id, title: 'Atelier Node',
        scheduledStartAt: new Date(Date.now() + 40 * 86_400_000),
        status: 'SCHEDULED', roomName: 'room-atelier',
      },
    })
    await cancelSubscription(trainer.id, user.id)

    const result = await endCanceledSubscriptions()

    expect(result.livesCanceled).toBe(1)
    expect((await prisma.liveSession.findUniqueOrThrow({ where: { id: live.id } })).status).toBe('CANCELED')
    const avis = await prisma.notification.findFirstOrThrow({
      where: { userId: membre.id, type: 'LIVE_SESSION_CANCELED' },
    })
    expect(avis.title).toContain('Atelier Node')
  })

  it('la dette est prélevée sur le solde, sans consentement au prélèvement', async () => {
    const { user, trainer } = await setup({ periodEnd: new Date(Date.now() - 1000), balance: 20_000 })
    const periodStart = new Date(Date.now() - 40 * 86_400_000)
    await prisma.subscriptionCharge.create({
      data: {
        trainerId: trainer.id, cadence: 'MONTHLY',
        periodStart, periodEnd: periodEndFor(periodStart, 'MONTHLY'),
        listPriceFcfa: 5_000, amountDueFcfa: 5_000, status: 'DUE',
      },
    })
    await cancelSubscription(trainer.id, user.id)

    // `autoRenew` vaut faux — jamais activé. La période a pourtant été
    // consommée : elle se paie (arbitrage 10).
    const result = await endCanceledSubscriptions()

    expect(result.arrearsDebitedFcfa).toBe(5_000)
    expect((await prisma.wallet.findFirstOrThrow({ where: { trainerId: trainer.id } })).balance).toBe(15_000)
    const debit = await prisma.walletDebit.findFirstOrThrow({ where: { trainerId: trainer.id } })
    expect(debit.reason).toBe('SUBSCRIPTION_ARREARS')
  })

  it('un solde insuffisant laisse la dette entière, sans prélèvement partiel', async () => {
    const { user, trainer } = await setup({ periodEnd: new Date(Date.now() - 1000), balance: 2_000 })
    const periodStart = new Date(Date.now() - 40 * 86_400_000)
    const charge = await prisma.subscriptionCharge.create({
      data: {
        trainerId: trainer.id, cadence: 'MONTHLY',
        periodStart, periodEnd: periodEndFor(periodStart, 'MONTHLY'),
        listPriceFcfa: 5_000, amountDueFcfa: 5_000, status: 'DUE',
      },
    })
    await cancelSubscription(trainer.id, user.id)

    const result = await endCanceledSubscriptions()

    expect(result.arrearsDebitedFcfa).toBe(0)
    expect((await prisma.subscriptionCharge.findUniqueOrThrow({ where: { id: charge.id } })).status).toBe('DUE')
    expect((await prisma.wallet.findFirstOrThrow({ where: { trainerId: trainer.id } })).balance).toBe(2_000)
  })

  it('le terme ne se joue qu\'une fois, même si le job est rejoué', async () => {
    const { user, trainer } = await setup({ periodEnd: new Date(Date.now() - 1000) })
    await course(trainer.id, 'publiee', 'published')
    await cancelSubscription(trainer.id, user.id)

    await endCanceledSubscriptions()
    const second = await endCanceledSubscriptions()

    expect(second.ended).toBe(0)
  })

  it('après le terme, on ne revient pas sur sa résiliation', async () => {
    const { user, trainer } = await setup({ periodEnd: new Date(Date.now() - 1000) })
    await cancelSubscription(trainer.id, user.id)
    await endCanceledSubscriptions()

    // C'est une réactivation, et elle se paie (arbitrage 7).
    await expect(resumeSubscription(trainer.id, user.id)).rejects.toThrow('ALREADY_ENDED')
  })
})
