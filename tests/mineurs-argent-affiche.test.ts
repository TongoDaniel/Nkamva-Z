// ==========================================================================
// Ce que les écrans et les avis disent de l'argent — campagne du 12 octobre
// 2026, m9, m11, m20
// ==========================================================================
// m9  — après un double clic, une ligne « Annulé 20 000 FCFA » dans les
//       historiques de l'apprenant et de la formatrice ;
// m11 — « 5000 FCFA » sans espace des milliers, « 1 membres », « Vos 3
//       ressource(s) » ;
// m20 — une facture à 0 FCFA pour chaque mois offert.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { fmtCount } from '@/lib/format'
import { listMyPurchases } from '@/lib/purchases'
import { listTrainerSales } from '@/lib/trainer-stats'
import { issueInvoiceForSubscriptionCharge } from '@/lib/invoices'
import { initiateMembershipPayment, activateMembershipForPurchase, renewDueMemberships } from '@/lib/memberships'

const DAY = 86_400_000
const plain = (s: string) => s.replace(/[  ]/g, ' ')

describe('m11 — les nombres s\'accordent', () => {
  it('zéro et un au singulier, deux et plus au pluriel', () => {
    expect(plain(fmtCount(0, 'membre'))).toBe('0 membre')
    expect(plain(fmtCount(1, 'membre'))).toBe('1 membre')
    expect(plain(fmtCount(3, 'membre'))).toBe('3 membres')
    expect(plain(fmtCount(2500, 'palier de stockage', 'paliers de stockage'))).toBe('2 500 paliers de stockage')
  })
})

describe('Historiques, factures, avis', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup() {
    const trainerUser = await prisma.user.create({ data: { email: 'mariam@test.com', role: 'TRAINER' } })
    const trainer = await prisma.trainerProfile.create({ data: { userId: trainerUser.id, approvedAt: new Date() } })
    await prisma.wallet.create({ data: { trainerId: trainer.id, balance: 0 } })
    const learner = await prisma.user.create({ data: { email: 'paul@test.com', role: 'LEARNER' } })
    return { trainerUser, trainer, learner }
  }

  it('m9 — une tentative annulée n\'apparaît ni chez l\'apprenant ni dans les ventes', async () => {
    const { trainer, learner } = await setup()
    const base = {
      learnerId: learner.id, trainerId: trainer.id, amountFcfa: 20_000, commissionRate: 0.15,
      trainerShareFcfa: 17_000, platformShareFcfa: 3000, provider: 'STRIPE' as const,
    }
    await prisma.purchase.create({ data: { ...base, providerTransactionId: 'pi_reussi', providerStatus: 'SUCCEEDED' } })
    await prisma.purchase.create({ data: { ...base, providerTransactionId: 'pi_annule', providerStatus: 'CANCELED' } })
    await prisma.purchase.create({ data: { ...base, providerTransactionId: 'pi_refuse', providerStatus: 'FAILED' } })

    const mine = await listMyPurchases(learner.id, 1, 20)
    expect(mine.items.map((p) => p.providerStatus).sort()).toEqual(['FAILED', 'SUCCEEDED'])
    expect(mine.total).toBe(2)

    const sales = await listTrainerSales(trainer.id, 1, 20)
    expect(sales.rows.some((r) => r.providerStatus === 'CANCELED')).toBe(false)
  })

  it('m20 — un mois offert n\'émet pas de facture', async () => {
    const { trainer } = await setup()
    const charge = await prisma.subscriptionCharge.create({
      data: {
        trainerId: trainer.id, cadence: 'MONTHLY', status: 'WAIVED',
        periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-09-01'),
        listPriceFcfa: 0, amountDueFcfa: 0,
      },
    })

    expect(await issueInvoiceForSubscriptionCharge(charge.id)).toBeNull()
    expect(await prisma.invoice.count()).toBe(0)
  })

  it('m11 — l\'avis d\'échéance écrit le montant avec ses espaces', async () => {
    const { trainer, learner } = await setup()
    const community = await prisma.community.create({
      data: { trainerId: trainer.id, name: 'Atelier', slug: 'atelier', priceFcfa: 5000 },
    })
    const intent = await initiateMembershipPayment(community.id, learner.id, 'STRIPE')
    await prisma.$transaction(async (tx) => {
      await tx.purchase.update({ where: { id: intent.purchaseId }, data: { providerStatus: 'SUCCEEDED' } })
      await activateMembershipForPurchase(tx, intent.purchaseId)
    })

    await renewDueMemberships(new Date(Date.now() + 32 * DAY))

    const notice = await prisma.notification.findFirstOrThrow({
      where: { userId: learner.id, type: 'MEMBERSHIP_PAYMENT_DUE' },
    })
    expect(plain(notice.body)).toMatch(/^5 000 FCFA pour le mois en cours/)
  })
})
