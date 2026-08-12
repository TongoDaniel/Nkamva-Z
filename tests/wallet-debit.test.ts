// ==========================================================================
// Prélèvement d'une échéance sur le solde — arbitrages 8, 9, 10
// ==========================================================================
// Ce module est le seul endroit du dépôt qui fasse baisser un solde autrement
// qu'un retrait ou un remboursement de litige. Les cas de **refus** comptent
// plus que le cas nominal : prélever à tort, ici, c'est prendre l'argent d'un
// acheteur en attente de remboursement.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { debitWalletForSubscriptionCharge, withdrawableBalance } from '@/lib/wallet'
import { periodEndFor } from '@/lib/subscriptions'

describe('Prélèvement d\'une échéance sur le solde', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup(wallet: {
    balance: number; reserved?: number; pendingPayout?: number
  } | null = { balance: 0 }) {
    const user = await prisma.user.create({ data: { email: 'formateur@test.com', role: 'TRAINER' } })
    const trainer = await prisma.trainerProfile.create({
      data: {
        userId: user.id, approvedAt: new Date(),
        subscriptionStatus: 'PAST_DUE', subscriptionPastDueAt: new Date(),
      },
    })
    if (wallet) {
      await prisma.wallet.create({
        data: {
          trainerId: trainer.id,
          balance: wallet.balance,
          reservedBalance: wallet.reserved ?? 0,
          pendingPayoutBalance: wallet.pendingPayout ?? 0,
        },
      })
    }
    return { user, trainer }
  }

  /** Une échéance ouverte, comme le renouvellement la laisse. */
  function charge(
    trainerId: string,
    amountDueFcfa: number,
    status: 'DUE' | 'SETTLED' | 'WAIVED' = 'DUE',
  ) {
    const periodStart = new Date()
    return prisma.subscriptionCharge.create({
      data: {
        trainerId, cadence: 'MONTHLY',
        periodStart, periodEnd: periodEndFor(periodStart, 'MONTHLY'),
        listPriceFcfa: amountDueFcfa, amountDueFcfa, status,
        settledAt: status === 'DUE' ? null : periodStart,
      },
    })
  }

  // -------------------------------------------------------------------------
  it('solde suffisant : la période est réglée et le débit laisse une trace', async () => {
    const { trainer } = await setup({ balance: 20_000 })
    const c = await charge(trainer.id, 5_000)

    const result = await debitWalletForSubscriptionCharge(c.id, 'SUBSCRIPTION_RENEWAL')

    expect(result).toMatchObject({ debited: true, amountFcfa: 5_000 })
    const after = await prisma.subscriptionCharge.findUniqueOrThrow({ where: { id: c.id } })
    expect(after.status).toBe('SETTLED')
    expect(after.settledAt).not.toBeNull()

    const wallet = await prisma.wallet.findFirstOrThrow({ where: { trainerId: trainer.id } })
    expect(wallet.balance).toBe(15_000)

    // La trace : sans elle, le formateur voit son solde baisser sans rien à lire.
    const debit = await prisma.walletDebit.findFirstOrThrow({ where: { trainerId: trainer.id } })
    expect(debit.amountFcfa).toBe(5_000)
    expect(debit.reason).toBe('SUBSCRIPTION_RENEWAL')
    expect(debit.subscriptionChargeId).toBe(c.id)

    // Plus rien de dû : le formateur redevient actif.
    const profile = await prisma.trainerProfile.findUniqueOrThrow({ where: { id: trainer.id } })
    expect(profile.subscriptionStatus).toBe('ACTIVE')
    expect(profile.subscriptionPastDueAt).toBeNull()
  })

  it('solde insuffisant : rien n\'est prélevé, jamais une part', async () => {
    const { trainer } = await setup({ balance: 3_000 })
    const c = await charge(trainer.id, 5_000)

    const result = await debitWalletForSubscriptionCharge(c.id, 'SUBSCRIPTION_RENEWAL')

    expect(result).toEqual({ debited: false, reason: 'INSUFFICIENT_BALANCE', withdrawableFcfa: 3_000 })
    // Un prélèvement partiel laisserait un reliquat qu'aucun mécanisme ne sait
    // solder : ni le rejeu, ni le paiement manuel, ni la facture.
    const wallet = await prisma.wallet.findFirstOrThrow({ where: { trainerId: trainer.id } })
    expect(wallet.balance).toBe(3_000)
    expect(await prisma.walletDebit.count()).toBe(0)
    expect((await prisma.subscriptionCharge.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('DUE')
  })

  it('solde négatif : rien à prélever', async () => {
    const { trainer } = await setup({ balance: -2_000 })
    const c = await charge(trainer.id, 5_000)

    const result = await debitWalletForSubscriptionCharge(c.id, 'SUBSCRIPTION_RENEWAL')

    expect(result).toMatchObject({ debited: false, reason: 'INSUFFICIENT_BALANCE' })
  })

  it('fonds gelés par un litige : le solde brut suffit, le retirable non', async () => {
    // 20 000 au solde, dont 18 000 réservés pour un litige en cours : ces fonds
    // peuvent devoir être rendus à un acheteur (décision 8). Les prélever
    // financerait l'abonnement avec l'argent de quelqu'un d'autre.
    const { trainer } = await setup({ balance: 20_000, reserved: 18_000 })
    const c = await charge(trainer.id, 5_000)

    const result = await debitWalletForSubscriptionCharge(c.id, 'SUBSCRIPTION_RENEWAL')

    expect(result).toEqual({ debited: false, reason: 'INSUFFICIENT_BALANCE', withdrawableFcfa: 2_000 })
    const wallet = await prisma.wallet.findFirstOrThrow({ where: { trainerId: trainer.id } })
    expect(wallet.balance).toBe(20_000)
  })

  it('retrait déjà demandé : il passe avant l\'abonnement', async () => {
    const { trainer } = await setup({ balance: 20_000, pendingPayout: 17_000 })
    const c = await charge(trainer.id, 5_000)

    const result = await debitWalletForSubscriptionCharge(c.id, 'SUBSCRIPTION_RENEWAL')

    expect(result).toEqual({ debited: false, reason: 'INSUFFICIENT_BALANCE', withdrawableFcfa: 3_000 })
  })

  it('aucun portefeuille : le formateur n\'a jamais rien encaissé', async () => {
    const { trainer } = await setup(null)
    const c = await charge(trainer.id, 5_000)

    const result = await debitWalletForSubscriptionCharge(c.id, 'SUBSCRIPTION_RENEWAL')

    expect(result).toMatchObject({ debited: false, reason: 'NO_WALLET' })
  })

  it('une période offerte ou déjà réglée ne se prélève pas', async () => {
    const { trainer } = await setup({ balance: 50_000 })
    const offerte = await charge(trainer.id, 0, 'WAIVED')
    const reglee = await charge(trainer.id, 5_000, 'SETTLED')

    expect(await debitWalletForSubscriptionCharge(offerte.id, 'SUBSCRIPTION_RENEWAL'))
      .toMatchObject({ debited: false, reason: 'CHARGE_NOT_DUE' })
    expect(await debitWalletForSubscriptionCharge(reglee.id, 'SUBSCRIPTION_RENEWAL'))
      .toMatchObject({ debited: false, reason: 'CHARGE_NOT_DUE' })
    expect(await prisma.walletDebit.count()).toBe(0)
  })

  it('rejouer le prélèvement de la même période ne débite pas deux fois', async () => {
    const { trainer } = await setup({ balance: 20_000 })
    const c = await charge(trainer.id, 5_000)

    await debitWalletForSubscriptionCharge(c.id, 'SUBSCRIPTION_RENEWAL')
    // Le rejeu nocturne de l'arbitrage 9 repasse chaque nuit sur les mêmes
    // périodes : c'est exactement ce chemin-là.
    const replay = await debitWalletForSubscriptionCharge(c.id, 'SUBSCRIPTION_RENEWAL')

    expect(replay).toMatchObject({ debited: false, reason: 'CHARGE_NOT_DUE' })
    const wallet = await prisma.wallet.findFirstOrThrow({ where: { trainerId: trainer.id } })
    expect(wallet.balance).toBe(15_000)
    expect(await prisma.walletDebit.count()).toBe(1)
  })

  it('un arriéré plus ancien laisse le formateur en impayé', async () => {
    const { trainer } = await setup({ balance: 20_000 })
    const ancienne = await prisma.subscriptionCharge.create({
      data: {
        trainerId: trainer.id, cadence: 'MONTHLY',
        periodStart: new Date(Date.now() - 60 * 86_400_000),
        periodEnd: new Date(Date.now() - 30 * 86_400_000),
        listPriceFcfa: 5_000, amountDueFcfa: 5_000, status: 'DUE',
      },
    })
    const recente = await charge(trainer.id, 5_000)

    await debitWalletForSubscriptionCharge(recente.id, 'SUBSCRIPTION_RENEWAL')

    // Régler la dernière ne solde pas la précédente.
    const profile = await prisma.trainerProfile.findUniqueOrThrow({ where: { id: trainer.id } })
    expect(profile.subscriptionStatus).toBe('PAST_DUE')
    expect((await prisma.subscriptionCharge.findUniqueOrThrow({ where: { id: ancienne.id } })).status).toBe('DUE')
  })

  it('le retirable est bien ce qui reste après réserves et retrait', () => {
    expect(withdrawableBalance({ balance: 10_000, reservedBalance: 3_000, pendingPayoutBalance: 2_000 }))
      .toBe(5_000)
  })
})
