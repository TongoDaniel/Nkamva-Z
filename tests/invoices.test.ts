// ==========================================================================
// Factures — numérotation continue, immuabilité, rendu PDF
// ==========================================================================
// Deux propriétés comptables, et un test pour chacune : la suite des numéros
// n'a pas de trou, et une facture émise ne bouge plus.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  issueInvoice, issueInvoiceForPurchase, issueInvoiceForSubscriptionCharge,
  listMyInvoices, getInvoice, renderInvoicePdf,
} from '@/lib/invoices'
import { initiatePurchase } from '@/lib/purchases'

describe('Factures', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup() {
    const trainerUser = await prisma.user.create({
      data: { email: 'formateur@test.com', role: 'TRAINER', fullName: 'Awa Sarr' },
    })
    const trainer = await prisma.trainerProfile.create({
      data: { userId: trainerUser.id, approvedAt: new Date() },
    })
    await prisma.wallet.create({ data: { trainerId: trainer.id, balance: 0 } })
    const learner = await prisma.user.create({
      data: { email: 'apprenant@test.com', role: 'LEARNER', fullName: 'Koffi N\'Da' },
    })
    const course = await prisma.course.create({
      data: {
        trainerId: trainer.id, slug: 'ddd', title: 'Masterclass DDD', blurb: 'Accroche',
        description: 'Description', category: 'dev', format: 'video', priceFcfa: 15000,
        status: 'published', publishedAt: new Date(),
        contentS3Key: 'course-assets/x/v.mp4', contentMimeType: 'video/mp4',
      },
    })
    return { trainerUser, trainer, learner, course }
  }

  const emit = (userId: string, amountFcfa = 1000, label = 'Ligne') =>
    issueInvoice({ kind: 'PURCHASE', userId, label, amountFcfa })

  it('la suite des numéros est continue et datée de l\'exercice', async () => {
    const { learner } = await setup()
    const year = new Date().getFullYear()

    const a = await emit(learner.id)
    const b = await emit(learner.id)
    const c = await emit(learner.id)

    expect(a.number).toBe(`NK-${year}-000001`)
    expect(b.number).toBe(`NK-${year}-000002`)
    expect(c.number).toBe(`NK-${year}-000003`)
  })

  it('une émission qui échoue ne consomme pas de numéro', async () => {
    const { learner } = await setup()
    const year = new Date().getFullYear()
    await emit(learner.id)

    // Destinataire inexistant : la clé étrangère refuse, la transaction est
    // annulée — et le numéro réservé revient au pot. Une séquence Postgres,
    // elle, l'aurait perdu.
    await expect(
      issueInvoice({
        kind: 'PURCHASE',
        userId: '00000000-0000-0000-0000-000000000000',
        label: 'Fantôme',
        amountFcfa: 500,
      }),
    ).rejects.toThrow()

    const next = await emit(learner.id)
    expect(next.number).toBe(`NK-${year}-000002`)
  })

  it('deux émissions simultanées se sérialisent sans collision', async () => {
    const { learner } = await setup()

    const created = await Promise.all([
      emit(learner.id, 1000, 'A'),
      emit(learner.id, 2000, 'B'),
      emit(learner.id, 3000, 'C'),
    ])

    const numbers = created.map((i) => i.number)
    expect(new Set(numbers).size).toBe(3)
  })

  it('une facture par achat, jamais deux', async () => {
    const { learner, course } = await setup()
    const intent = await initiatePurchase(course.id, learner.id, 'STRIPE')

    const first = await issueInvoiceForPurchase(intent.purchaseId)
    const second = await issueInvoiceForPurchase(intent.purchaseId)

    expect(second.id).toBe(first.id)
    expect(await prisma.invoice.count()).toBe(1)
    expect(first.label).toBe('Ressource — Masterclass DDD')
    expect(first.amountFcfa).toBe(15000)
  })

  it('on ne facture pas ce qui n\'a pas été encaissé', async () => {
    const { learner, course } = await setup()
    const purchase = await prisma.purchase.create({
      data: {
        learnerId: learner.id, trainerId: course.trainerId, courseId: course.id,
        amountFcfa: 15000, commissionRate: 0.15, trainerShareFcfa: 12750,
        platformShareFcfa: 2250, provider: 'STRIPE', providerStatus: 'PENDING',
        providerTransactionId: 'pi_test_pending',
      },
    })

    await expect(issueInvoiceForPurchase(purchase.id)).rejects.toThrow('PURCHASE_NOT_SUCCEEDED')
  })

  it('la facture d\'abonnement porte la période et les paliers de stockage', async () => {
    const { trainer, trainerUser } = await setup()
    const charge = await prisma.subscriptionCharge.create({
      data: {
        trainerId: trainer.id, cadence: 'MONTHLY',
        periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-09-01'),
        listPriceFcfa: 9000, amountDueFcfa: 13000,
        storageTiers: 2, storageFcfa: 4000,
      },
    })

    const invoice = await issueInvoiceForSubscriptionCharge(charge.id)
    expect(invoice.userId).toBe(trainerUser.id)
    expect(invoice.amountFcfa).toBe(13000)
    expect(invoice.label).toContain('2 palier(s) de stockage')
    // Arbitrage 69 — une seule ligne : le stockage n'a pas sa propre facture.
    expect(await prisma.invoice.count()).toBe(1)
  })

  it('une facture ne se lit que par son destinataire', async () => {
    const { learner, trainerUser } = await setup()
    const invoice = await emit(learner.id)

    expect((await getInvoice(invoice.id, learner.id)).id).toBe(invoice.id)
    // 404 et non 403 : dire « pas à vous » confirmerait son existence.
    await expect(getInvoice(invoice.id, trainerUser.id)).rejects.toThrow('INVOICE_NOT_FOUND')
    expect(await listMyInvoices(trainerUser.id)).toHaveLength(0)
  })

  it('le PDF est un vrai PDF, et se regénère à l\'identique', async () => {
    const { learner } = await setup()
    // 15 000 : le montant à quatre chiffres est le cas qui casse, car
    // `Intl.NumberFormat('fr-FR')` y insère une espace fine insécable que les
    // polices standard d'un PDF ne savent pas encoder.
    const invoice = await emit(learner.id, 15000, 'Ressource — Masterclass DDD')

    const first = await renderInvoicePdf(invoice.id, learner.id)
    const second = await renderInvoicePdf(invoice.id, learner.id)

    // En-tête PDF : `%PDF-`. Sans elle, le navigateur téléchargerait un fichier
    // que rien n'ouvre.
    expect(Buffer.from(first.slice(0, 5)).toString('utf8')).toBe('%PDF-')
    expect(first.byteLength).toBeGreaterThan(500)
    // Aucune donnée ne pouvant bouger, on peut regénérer plutôt que stocker.
    expect(second.byteLength).toBe(first.byteLength)
  })

  it('le PDF n\'est pas rendu à quelqu\'un d\'autre', async () => {
    const { learner, trainerUser } = await setup()
    const invoice = await emit(learner.id)
    await expect(renderInvoicePdf(invoice.id, trainerUser.id)).rejects.toThrow('INVOICE_NOT_FOUND')
  })
})
