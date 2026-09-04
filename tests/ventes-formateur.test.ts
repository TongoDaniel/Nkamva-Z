// ==========================================================================
// Lot 3 — L'historique des ventes du formateur (F7.11, arbitrage 125)
// ==========================================================================
// Un solde global ne dit pas d'où vient l'argent. L'audit du 1er septembre
// demande, pour chaque vente : ce qui a été vendu, quand, le brut, la
// commission retenue, le net et le statut.
//
// La règle qui compte ici est celle de la source : **rien n'est recalculé**.
// Les parts sont figées sur l'achat à la vente (décision 11). Un écran qui
// referait la division afficherait autre chose que ce qui a réellement été
// crédité le jour où le taux d'un formateur diffère du taux annoncé — ce que le
// modèle permet explicitement, `TrainerProfile.commissionRate` étant par
// formateur.
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { listTrainerSales, getTrainerSalesSummary } from '@/lib/trainer-stats'
import { PLATFORM_COMMISSION_RATE } from '@/lib/commission'

describe('Lot 3 — historique des ventes', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function unFormateur() {
    const user = await prisma.user.create({
      data: { email: 'formateur@test.com', role: 'TRAINER', fullName: 'Awa' },
    })
    const profile = await prisma.trainerProfile.create({
      data: { userId: user.id, verifiedLegalName: 'Awa Traoré', approvedAt: new Date() },
    })
    await prisma.wallet.create({ data: { trainerId: profile.id, balance: 0 } })
    return { user, profile }
  }

  async function uneRessource(trainerId: string, priceFcfa = 2000) {
    return prisma.course.create({
      data: {
        trainerId,
        slug: `ressource-${Math.random().toString(36).slice(2, 10)}`,
        title: 'Spiritualité et finance',
        blurb: 'Un guide',
        description: 'Un guide complet.',
        category: 'dev',
        format: 'pdf',
        priceFcfa,
        status: 'published',
        publishedAt: new Date(),
      },
    })
  }

  /** Un achat déjà réglé, écrit tel que le webhook l'aurait laissé. */
  async function uneVente(
    trainerId: string,
    courseId: string,
    opts: { amountFcfa?: number; rate?: number; status?: string; refunded?: boolean } = {},
  ) {
    const amountFcfa = opts.amountFcfa ?? 2000
    const rate = opts.rate ?? PLATFORM_COMMISSION_RATE
    const trainerShareFcfa = Math.round(amountFcfa * (1 - rate))
    const learner = await prisma.user.create({
      data: { email: `a${Math.random().toString(36).slice(2, 10)}@test.com`, role: 'LEARNER' },
    })
    return prisma.purchase.create({
      data: {
        learnerId: learner.id,
        trainerId,
        courseId,
        amountFcfa,
        commissionRate: rate,
        trainerShareFcfa,
        platformShareFcfa: amountFcfa - trainerShareFcfa,
        provider: 'STRIPE',
        providerStatus: (opts.status ?? 'SUCCEEDED') as never,
        providerTransactionId: `pi_${Math.random().toString(36).slice(2, 12)}`,
        ...(opts.refunded ? { refundedAt: new Date(), refundAmountFcfa: amountFcfa } : {}),
      },
    })
  }

  it('rend les trois montants de chaque vente, tels qu\'ils ont été figés', async () => {
    const { profile } = await unFormateur()
    const course = await uneRessource(profile.id, 2000)
    await uneVente(profile.id, course.id, { amountFcfa: 2000 })

    const { rows, total } = await listTrainerSales(profile.id, 1, 20)
    expect(total).toBe(1)
    // Le partage exact que l'audit cite : 1 700 reçus, 300 retenus sur 2 000.
    expect(rows[0].amountFcfa).toBe(2000)
    expect(rows[0].platformShareFcfa).toBe(300)
    expect(rows[0].trainerShareFcfa).toBe(1700)
    expect(rows[0].subject).toMatchObject({ kind: 'COURSE', title: 'Spiritualité et finance' })
  })

  it('ne recalcule rien : un taux propre au formateur est rendu tel quel', async () => {
    const { profile } = await unFormateur()
    const course = await uneRessource(profile.id, 10000)
    // Taux négocié à 5 %, différent du taux annoncé au public.
    await uneVente(profile.id, course.id, { amountFcfa: 10000, rate: 0.05 })

    const { rows } = await listTrainerSales(profile.id, 1, 20)
    expect(rows[0].commissionRate).toBe(0.05)
    expect(rows[0].platformShareFcfa).toBe(500)
    expect(rows[0].trainerShareFcfa).toBe(9500)
    // Et surtout : pas le résultat qu'aurait donné le taux annoncé.
    expect(rows[0].platformShareFcfa).not.toBe(10000 * PLATFORM_COMMISSION_RATE)
  })

  it('montre aussi les tentatives non abouties, qui expliquent les écarts', async () => {
    const { profile } = await unFormateur()
    const course = await uneRessource(profile.id)
    await uneVente(profile.id, course.id, { status: 'FAILED' })
    await uneVente(profile.id, course.id, { status: 'SUCCEEDED' })

    const { rows, total } = await listTrainerSales(profile.id, 1, 20)
    expect(total).toBe(2)
    expect(rows.map((r) => r.providerStatus).sort()).toEqual(['FAILED', 'SUCCEEDED'])
  })

  it('ne compte comme vente que ce qui est réellement encaissé', async () => {
    const { profile } = await unFormateur()
    const course = await uneRessource(profile.id)
    await uneVente(profile.id, course.id, { amountFcfa: 2000 })
    await uneVente(profile.id, course.id, { amountFcfa: 5000, status: 'FAILED' })
    await uneVente(profile.id, course.id, { amountFcfa: 9000, status: 'PENDING' })

    const summary = await getTrainerSalesSummary(profile.id)
    expect(summary.count).toBe(1)
    expect(summary.grossFcfa).toBe(2000)
    expect(summary.commissionFcfa).toBe(300)
    expect(summary.netFcfa).toBe(1700)
  })

  it('compte les remboursements à côté du total, jamais dedans', async () => {
    const { profile } = await unFormateur()
    const course = await uneRessource(profile.id)
    await uneVente(profile.id, course.id, { amountFcfa: 2000 })
    await uneVente(profile.id, course.id, { amountFcfa: 3000, refunded: true })

    const summary = await getTrainerSalesSummary(profile.id)
    // Le brut reste celui des ventes encaissées : un formateur qui additionne
    // la colonne du tableau doit retomber sur ce chiffre.
    expect(summary.grossFcfa).toBe(2000)
    expect(summary.refundedCount).toBe(1)
    expect(summary.refundedFcfa).toBe(3000)
  })

  it('ne laisse pas voir les ventes d\'un autre formateur', async () => {
    const a = await unFormateur()
    const b = await prisma.user.create({ data: { email: 'autre@test.com', role: 'TRAINER' } })
    const profileB = await prisma.trainerProfile.create({
      data: { userId: b.id, verifiedLegalName: 'Autre', approvedAt: new Date() },
    })
    const courseA = await uneRessource(a.profile.id)
    const courseB = await uneRessource(profileB.id)
    await uneVente(a.profile.id, courseA.id)
    await uneVente(profileB.id, courseB.id)

    expect((await listTrainerSales(a.profile.id, 1, 20)).total).toBe(1)
    expect((await getTrainerSalesSummary(profileB.id)).count).toBe(1)
  })

  it('garde la ligne lisible quand la ressource a disparu', async () => {
    const { profile } = await unFormateur()
    const course = await uneRessource(profile.id)
    const vente = await uneVente(profile.id, course.id)
    // Un achat survit à sa ressource : la clé étrangère est en `Restrict`, donc
    // on délie plutôt que de supprimer — c'est le cas qu'on veut couvrir.
    await prisma.purchase.update({ where: { id: vente.id }, data: { courseId: null } })

    const { rows } = await listTrainerSales(profile.id, 1, 20)
    expect(rows[0].subject.kind).toBe('GONE')
    // Le montant, lui, reste : sans quoi le total ne s'expliquerait plus.
    expect(rows[0].trainerShareFcfa).toBe(1700)
  })

  it('rend les ventes de la plus récente à la plus ancienne', async () => {
    const { profile } = await unFormateur()
    const course = await uneRessource(profile.id)
    const vieille = await uneVente(profile.id, course.id, { amountFcfa: 1000 })
    await prisma.purchase.update({
      where: { id: vieille.id },
      data: { createdAt: new Date(Date.now() - 30 * 86_400_000) },
    })
    await uneVente(profile.id, course.id, { amountFcfa: 2000 })

    const { rows } = await listTrainerSales(profile.id, 1, 20)
    expect(rows[0].amountFcfa).toBe(2000)
    expect(rows[1].amountFcfa).toBe(1000)
  })
})
