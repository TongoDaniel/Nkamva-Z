// ==========================================================================
// Fin de vie de l'espace formateur — arbitrages 6 et 15
// ==========================================================================
// L'arbitrage 5 ferme l'espace « quand il ne reste ni argent à rendre, ni
// litige ouvert ». Pris au pied de la lettre, il boucle indéfiniment : le
// retrait minimum est de 10 000 FCFA, et un formateur qui part avec 3 200 FCFA
// ne peut jamais les retirer. D'où le versement dérogatoire de l'arbitrage 6,
// et la clôture à 24 mois de l'arbitrage 15.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  requestPayout, PAYOUT_MIN_AMOUNT_FCFA, CLOSING_PAYOUT_FEE_FCFA,
} from '@/lib/payouts'
import { createPayoutMethod, verifyPayoutMethod, expirePayoutMethodCarence } from '@/lib/payout-methods'
import { closeDormantSpaces, DORMANT_SPACE_MONTHS } from '@/lib/subscriptions'

describe("Fin de vie de l'espace formateur", () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setupTrainer(opts: { balance?: number; canceled?: boolean } = {}) {
    const user = await prisma.user.create({ data: { email: 'formateur@test.com', role: 'TRAINER' } })
    const profile = await prisma.trainerProfile.create({
      data: {
        userId: user.id,
        verifiedLegalName: 'Marie Formatrice',
        approvedAt: new Date(Date.now() - 400 * 86_400_000),
        ...(opts.canceled
          ? { subscriptionStatus: 'CANCELED' as const, subscriptionCanceledAt: new Date() }
          : {}),
      },
    })
    await prisma.wallet.create({
      data: { trainerId: profile.id, balance: opts.balance ?? 0 },
    })
    const finance = await prisma.user.create({
      data: { email: 'finances@test.com', role: 'ADMIN', adminRole: 'FINANCES' },
    })
    return { user, profile, finance }
  }

  const IBAN_INPUT = {
    type: 'BANK_IBAN' as const, accountNature: 'INDIVIDUAL' as const,
    holderName: 'Marie Formatrice', iban: 'FR7630006000011234567890189', bic: 'AGRIFRPP',
  }

  /** Un moyen de paiement vérifié et hors carence : le retrait est possible. */
  async function verifiedMethod(profileId: string, userId: string, financeId: string) {
    const method = await createPayoutMethod(profileId, userId, IBAN_INPUT)
    const fresh = await prisma.payoutMethod.findUniqueOrThrow({ where: { id: method.id } })
    await verifyPayoutMethod(method.id, {
      method: 'MANUAL_FINANCE', expectedUpdatedAt: fresh.updatedAt.toISOString(),
      actorId: financeId, actorRole: 'FINANCES',
    })
    await prisma.payoutMethod.update({
      where: { id: method.id }, data: { carenceUntil: new Date(Date.now() - 1000) },
    })
    await expirePayoutMethodCarence()
  }

  // -------------------------------------------------------------------------
  // Arbitrage 6 — le versement de clôture
  // -------------------------------------------------------------------------

  it('le plancher de 10 000 FCFA tient pour un formateur en activité', async () => {
    const { user, profile, finance } = await setupTrainer({ balance: 3_200 })
    await verifiedMethod(profile.id, user.id, finance.id)

    await expect(requestPayout(profile.id, user.id, 3_200)).rejects.toThrow('AMOUNT_BELOW_MINIMUM')
    expect(PAYOUT_MIN_AMOUNT_FCFA).toBe(10_000)
  })

  it('le versement de clôture ignore le plancher et retient les frais', async () => {
    const { user, profile, finance } = await setupTrainer({ balance: 3_200, canceled: true })
    await verifiedMethod(profile.id, user.id, finance.id)

    const payout = await requestPayout(profile.id, user.id, 3_200, { closing: true })

    expect(payout.amountFcfa).toBe(3_200)
    expect(payout.isClosingPayout).toBe(true)
    // Les frais sont à sa charge : la plateforme ne paie pas pour rendre
    // l'argent d'un formateur parti.
    expect(payout.feeFcfa).toBe(CLOSING_PAYOUT_FEE_FCFA)
  })

  it("la dérogation est réservée à l'espace en état de solde", async () => {
    const { user, profile, finance } = await setupTrainer({ balance: 3_200 })
    await verifiedMethod(profile.id, user.id, finance.id)

    // Un formateur en activité n'y a pas droit : l'ouvrir à tous viderait le
    // plancher de son sens.
    await expect(requestPayout(profile.id, user.id, 3_200, { closing: true }))
      .rejects.toThrow('NOT_CLOSING')
  })

  it('un reliquat inférieur aux frais ne se verse pas', async () => {
    const { user, profile, finance } = await setupTrainer({ balance: 300, canceled: true })
    await verifiedMethod(profile.id, user.id, finance.id)

    // Le transfert coûterait plus que ce qu'il rend.
    await expect(requestPayout(profile.id, user.id, 300, { closing: true }))
      .rejects.toThrow('AMOUNT_BELOW_FEES')
  })

  it('un retrait ordinaire ne porte aucun frais', async () => {
    const { user, profile, finance } = await setupTrainer({ balance: 50_000 })
    await verifiedMethod(profile.id, user.id, finance.id)

    const payout = await requestPayout(profile.id, user.id, 20_000)

    expect(payout.feeFcfa).toBe(0)
    expect(payout.isClosingPayout).toBe(false)
  })

  // -------------------------------------------------------------------------
  // Arbitrage 15 — la clôture des espaces dormants
  // -------------------------------------------------------------------------

  /** Recule la date de résiliation de N mois. */
  async function canceledMonthsAgo(profileId: string, months: number) {
    const at = new Date()
    at.setMonth(at.getMonth() - months)
    await prisma.trainerProfile.update({
      where: { id: profileId },
      data: { subscriptionStatus: 'CANCELED', subscriptionCanceledAt: at },
    })
  }

  it('un espace récemment résilié ne bouge pas', async () => {
    const { profile } = await setupTrainer({ canceled: true })
    await canceledMonthsAgo(profile.id, 6)

    expect(await closeDormantSpaces()).toEqual({ closed: 0, reminded: 0 })
  })

  it('un rappel part un mois avant la clôture', async () => {
    const { user, profile } = await setupTrainer({ balance: 4_000, canceled: true })
    await canceledMonthsAgo(profile.id, DORMANT_SPACE_MONTHS - 1)

    const result = await closeDormantSpaces()

    expect(result).toMatchObject({ closed: 0, reminded: 1 })
    const avis = await prisma.notification.findFirstOrThrow({
      where: { userId: user.id, type: 'TRAINER_SPACE_CLOSING' },
    })
    // Le solde restant est nommé : la clôture ne doit pas être une découverte.
    expect(avis.body).toContain('à retirer')
  })

  it("l'espace se ferme au terme des 24 mois", async () => {
    const { user, profile } = await setupTrainer({ canceled: true })
    await canceledMonthsAgo(profile.id, DORMANT_SPACE_MONTHS + 1)

    const result = await closeDormantSpaces()

    expect(result).toMatchObject({ closed: 1, reminded: 0 })
    await prisma.notification.findFirstOrThrow({
      where: { userId: user.id, type: 'TRAINER_SPACE_CLOSED' },
    })
    await prisma.auditLog.findFirstOrThrow({
      where: { action: 'TRAINER_SPACE_CLOSED', targetId: profile.id },
    })
  })

  it('un litige ouvert retient l\'espace, quelle que soit son ancienneté', async () => {
    const { profile } = await setupTrainer({ canceled: true })
    await canceledMonthsAgo(profile.id, DORMANT_SPACE_MONTHS + 12)

    const learner = await prisma.user.create({ data: { email: 'acheteur@test.com', role: 'LEARNER' } })
    const purchase = await prisma.purchase.create({
      data: {
        learnerId: learner.id, trainerId: profile.id,
        amountFcfa: 10_000, commissionRate: 0.15,
        trainerShareFcfa: 8_500, platformShareFcfa: 1_500,
        provider: 'STRIPE', providerStatus: 'SUCCEEDED',
      },
    })
    const dispute = await prisma.dispute.create({
      data: {
        purchaseId: purchase.id, learnerId: learner.id, trainerId: profile.id,
        reason: 'CONTENT_MISMATCH', status: 'WAITING_LEARNER',
        source: 'LEARNER_REQUEST', disputedAmountFcfa: 10_000,
      },
    })

    // Il doit pouvoir y répondre, et les fonds réservés lui appartiennent
    // peut-être encore.
    expect(await closeDormantSpaces()).toEqual({ closed: 0, reminded: 0 })

    // Une fois le litige tranché, plus rien ne retient l'espace.
    await prisma.dispute.update({
      where: { id: dispute.id }, data: { status: 'RESOLVED_REJECTED' },
    })
    expect(await closeDormantSpaces()).toMatchObject({ closed: 1 })
  })

  it('un formateur en activité n\'est jamais clôturé', async () => {
    const { profile } = await setupTrainer()
    await prisma.trainerProfile.update({
      where: { id: profile.id },
      data: { subscriptionCanceledAt: new Date(Date.now() - 900 * 86_400_000) },
    })

    // Résilié mais pas encore arrivé à son terme : `subscriptionStatus` fait
    // foi, pas la date de la demande.
    expect(await closeDormantSpaces()).toEqual({ closed: 0, reminded: 0 })
  })
})
