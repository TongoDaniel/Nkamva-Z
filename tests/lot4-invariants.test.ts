// ==========================================================================
// Lot 4 — Tests du parcours cœur (catalogue, achat, accès)
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { searchCourses, getPublicCourse } from '@/lib/catalog'
import { createCourse, publishCourse } from '@/lib/courses'
import { initiatePurchase, reconcilePurchase } from '@/lib/purchases'
import { checkCourseAccess, updateWatchProgress, markCourseDownloaded, getConsumptionPercent } from '@/lib/access'
import { POST as stripeWebhookHandler } from '@/app/api/webhooks/stripe/route'
import { POST as cinetpayWebhookHandler } from '@/app/api/webhooks/cinetpay/route'

function stripeSucceededRequest(providerTransactionId: string) {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'payment_intent.succeeded',
      data: { object: { id: providerTransactionId } },
    }),
  })
}

describe('Lot 4 — Parcours cœur', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  // Helper : setup formateur + cours publié
  async function setupTrainerWithCourse(opts: { price?: number; format?: string; duration?: number } = {}) {
    const trainer = await prisma.user.create({ data: { email: 'trainer@test.com', role: 'TRAINER' } })
    const profile = await prisma.trainerProfile.create({
      data: { userId: trainer.id, verifiedLegalName: 'Test Trainer', approvedAt: new Date(Date.now() - 40 * 86400000) },
    })
    await prisma.wallet.create({ data: { trainerId: profile.id, balance: 0 } })

    const course = await createCourse(profile.id, trainer.id, {
      title: 'Masterclass Node.js',
      blurb: 'Apprenez Node.js en profondeur',
      description: 'Un cours complet sur Node.js, de zéro à expert.',
      category: 'dev', format: opts.format || 'video',
      priceFcfa: opts.price || 15000,
      level: 'Avancé',
      durationSeconds: opts.duration || 14400, // 4h
    })
    await publishCourse(course.id, profile.id, trainer.id)

    return { trainer, profile, course }
  }

  // -------------------------------------------------------------------------
  it('catalogue : recherche + filtre + pagination', async () => {
    const { profile, trainer } = await setupTrainerWithCourse()

    // Créer plusieurs cours
    for (let i = 0; i < 5; i++) {
      const c = await createCourse(profile.id, trainer.id, {
        title: `Cours ${i}`, blurb: `Blurb ${i}`, description: `Desc ${i}`,
        category: i < 3 ? 'dev' : 'dsg', format: 'video', priceFcfa: 5000 + i * 1000,
      })
      await publishCourse(c.id, profile.id, trainer.id)
    }

    // Recherche par texte
    const result1 = await searchCourses({ search: 'Masterclass', page: 1, pageSize: 10 })
    expect(result1.total).toBe(1)
    expect(result1.items[0].title).toBe('Masterclass Node.js')

    // Filtre par catégorie
    const result2 = await searchCourses({ category: 'dev', page: 1, pageSize: 10 })
    expect(result2.total).toBe(4) // 1 masterclass + 3 cours dev (les 2 autres sont dsg)

    // Filtre par prix
    const result3 = await searchCourses({ minPrice: 7000, maxPrice: 9000, page: 1, pageSize: 10 })
    expect(result3.total).toBe(3) // cours à 7000, 8000, 9000

    // Pagination
    const result4 = await searchCourses({ page: 1, pageSize: 3 })
    expect(result4.items.length).toBe(3)
    expect(result4.total).toBe(6)
  })

  // -------------------------------------------------------------------------
  it('achat Stripe complet : initiation → webhook (simulé dev) → crédit wallet idempotent', async () => {
    const { profile, course } = await setupTrainerWithCourse({ price: 15000 })
    const learner = await prisma.user.create({ data: { email: 'learner@test.com', role: 'LEARNER' } })

    // Initier l'achat : en dev (pas de STRIPE_SECRET_KEY), initiatePurchase
    // simule la réception du webhook en appelant réellement la route
    // POST /api/webhooks/stripe (voir simulateStripeWebhook dans purchases.ts).
    const result = await initiatePurchase(course.id, learner.id, 'STRIPE')
    expect(result.provider).toBe('STRIPE')
    expect(result.providerTransactionId).toMatch(/^pi_/)

    // Vérifier que la Purchase est SUCCEEDED et le wallet crédité
    const purchase = await prisma.purchase.findUnique({ where: { id: result.purchaseId } })
    expect(purchase?.providerStatus).toBe('SUCCEEDED')

    const wallet = await prisma.wallet.findUnique({ where: { trainerId: profile.id } })
    expect(wallet?.balance).toBe(12750) // 85% de 15000

    // Deuxième initiation → ALREADY_PURCHASED
    await expect(
      initiatePurchase(course.id, learner.id, 'STRIPE'),
    ).rejects.toThrow('ALREADY_PURCHASED')
  })

  // -------------------------------------------------------------------------
  it('achat CinetPay complet : initiation → crédit wallet', async () => {
    const { profile, course } = await setupTrainerWithCourse({ price: 8000 })
    const learner = await prisma.user.create({ data: { email: 'learner@test.com', role: 'LEARNER' } })

    const result = await initiatePurchase(course.id, learner.id, 'CINETPAY')
    expect(result.provider).toBe('CINETPAY')
    expect(result.providerTransactionId).toMatch(/^cp_/)

    const wallet = await prisma.wallet.findUnique({ where: { trainerId: profile.id } })
    expect(wallet?.balance).toBe(6800) // 85% de 8000
  })

  // -------------------------------------------------------------------------
  it('webhook CinetPay malformé : journalisé (WEBHOOK_MALFORMED), aucun crédit', async () => {
    const res = await cinetpayWebhookHandler(new Request('http://localhost/api/webhooks/cinetpay', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'foo=bar', // ni cpm_trans_id en form-encoded, ni JSON valide
    }))
    expect(res.status).toBe(400)

    const auditCount = await prisma.auditLog.count({ where: { action: 'WEBHOOK_MALFORMED' } })
    expect(auditCount).toBe(1)
  })

  // -------------------------------------------------------------------------
  it('paiement non confirmé : sans appel webhook, aucun wallet crédité', async () => {
    const { profile, course } = await setupTrainerWithCourse({ price: 10000 })
    const learner = await prisma.user.create({ data: { email: 'learner@test.com', role: 'LEARNER' } })

    // Clé Stripe "présente" → initiatePurchase ne simule plus rien, la Purchase
    // reste PENDING tant que le vrai webhook n'a pas confirmé le paiement.
    const originalKey = process.env.STRIPE_SECRET_KEY
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_present'
    let result: Awaited<ReturnType<typeof initiatePurchase>>
    try {
      result = await initiatePurchase(course.id, learner.id, 'STRIPE')
    } finally {
      process.env.STRIPE_SECRET_KEY = originalKey
    }

    const purchase = await prisma.purchase.findUnique({ where: { id: result.purchaseId } })
    expect(purchase?.providerStatus).toBe('PENDING')

    const walletBefore = await prisma.wallet.findUnique({ where: { trainerId: profile.id } })
    expect(walletBefore?.balance).toBe(0)

    // Le webhook confirme enfin le paiement → c'est seulement là que le wallet est crédité
    const res = await stripeWebhookHandler(stripeSucceededRequest(result.providerTransactionId))
    expect(res.status).toBe(200)

    const walletAfter = await prisma.wallet.findUnique({ where: { trainerId: profile.id } })
    expect(walletAfter?.balance).toBe(8500) // 85% de 10000
  })

  // -------------------------------------------------------------------------
  it('webhook Stripe rejoué deux fois → wallet crédité une seule fois', async () => {
    const { profile, course } = await setupTrainerWithCourse({ price: 10000 })
    const learner = await prisma.user.create({ data: { email: 'learner@test.com', role: 'LEARNER' } })

    const originalKey = process.env.STRIPE_SECRET_KEY
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_present'
    let result: Awaited<ReturnType<typeof initiatePurchase>>
    try {
      result = await initiatePurchase(course.id, learner.id, 'STRIPE')
    } finally {
      process.env.STRIPE_SECRET_KEY = originalKey
    }

    // Le même événement webhook est livré deux fois (cas réel : retry provider)
    await stripeWebhookHandler(stripeSucceededRequest(result.providerTransactionId))
    await stripeWebhookHandler(stripeSucceededRequest(result.providerTransactionId))

    // Le wallet ne doit pas avoir été crédité deux fois
    const wallet = await prisma.wallet.findUnique({ where: { trainerId: profile.id } })
    expect(wallet?.balance).toBe(8500) // toujours 8500, pas 17000

    // Vérifier qu'un audit WEBHOOK_DUPLICATE_IGNORED a été écrit (une seule fois)
    const auditCount = await prisma.auditLog.count({
      where: { action: 'WEBHOOK_DUPLICATE_IGNORED' },
    })
    expect(auditCount).toBe(1)
  })

  // -------------------------------------------------------------------------
  it('accès refusé si Purchase.accessSuspended', async () => {
    const { course } = await setupTrainerWithCourse()
    const learner = await prisma.user.create({ data: { email: 'learner@test.com', role: 'LEARNER' } })

    // Acheter le cours
    await initiatePurchase(course.id, learner.id, 'STRIPE')

    // Accès accordé
    const access1 = await checkCourseAccess(course.id, learner.id)
    expect(access1.granted).toBe(true)

    // Suspendre l'accès (simule un litige ouvert — Lot 2)
    await prisma.purchase.updateMany({
      where: { learnerId: learner.id, courseId: course.id },
      data: { accessSuspended: true },
    })

    // Accès refusé
    const access2 = await checkCourseAccess(course.id, learner.id)
    expect(access2.granted).toBe(false)
    expect(access2.reason).toBe('ACCESS_SUSPENDED')
  })

  // -------------------------------------------------------------------------
  it('CourseView : watchedSeconds alimenté pour le streamé (video)', async () => {
    const { course } = await setupTrainerWithCourse({ format: 'video', duration: 3600 })
    const learner = await prisma.user.create({ data: { email: 'learner@test.com', role: 'LEARNER' } })
    await initiatePurchase(course.id, learner.id, 'STRIPE')

    // Mettre à jour la progression
    await updateWatchProgress(course.id, learner.id, 1800) // 50% de 3600s

    const view = await prisma.courseView.findUnique({
      where: { courseId_learnerId: { courseId: course.id, learnerId: learner.id } },
    })
    expect(view?.watchedSeconds).toBe(1800)
    expect(view?.downloaded).toBe(false)

    // Le % de consommation doit être 50%
    const percent = await getConsumptionPercent(course.id, learner.id)
    expect(percent).toBe(50)
  })

  // -------------------------------------------------------------------------
  it('CourseView : downloaded = true pour le téléchargeable (pdf)', async () => {
    const { profile } = await setupTrainerWithCourse({ format: 'pdf' })
    const course = await createCourse(profile.id, 'trainer-id', {
      title: 'Guide PDF', blurb: 'Guide PDF', description: 'Guide complet',
      category: 'dev', format: 'pdf', priceFcfa: 3000,
    })
    await publishCourse(course.id, profile.id, 'trainer-id')

    const learner = await prisma.user.create({ data: { email: 'learner@test.com', role: 'LEARNER' } })
    await initiatePurchase(course.id, learner.id, 'CINETPAY')

    // Marquer comme téléchargé
    await markCourseDownloaded(course.id, learner.id)

    const view = await prisma.courseView.findUnique({
      where: { courseId_learnerId: { courseId: course.id, learnerId: learner.id } },
    })
    expect(view?.downloaded).toBe(true)
    expect(view?.downloadedAt).not.toBeNull()

    // Le % de consommation doit être 100% (téléchargé = consommé)
    const percent = await getConsumptionPercent(course.id, learner.id)
    expect(percent).toBe(100)
  })

  // -------------------------------------------------------------------------
  it('CourseView : pas de téléchargement pour le streamé (video)', async () => {
    const { course } = await setupTrainerWithCourse({ format: 'video' })
    const learner = await prisma.user.create({ data: { email: 'learner@test.com', role: 'LEARNER' } })
    await initiatePurchase(course.id, learner.id, 'STRIPE')

    // Tenter de télécharger une vidéo → doit échouer
    await expect(
      markCourseDownloaded(course.id, learner.id),
    ).rejects.toThrow('NOT_DOWNLOADABLE')
  })

  // -------------------------------------------------------------------------
  // Le contrôle « déjà acheté ? » de `initiatePurchase` lit avant d'écrire :
  // deux requêtes simultanées voyaient toutes deux « aucun achat ». Sans l'index
  // unique partiel, ce test échouait 2 fois sur 6 — deux achats et un
  // portefeuille crédité du double, chaque achat ayant son propre
  // `providerTransactionId` et échappant donc à l'idempotence du crédit.
  it('un double clic sur « payer » ne crée qu\'un seul achat', async () => {
    const { course, profile } = await setupTrainerWithCourse({ price: 15000 })
    const learner = await prisma.user.create({ data: { email: 'double@test.com', role: 'LEARNER' } })

    const results = await Promise.allSettled([
      initiatePurchase(course.id, learner.id, 'STRIPE'),
      initiatePurchase(course.id, learner.id, 'STRIPE'),
    ])

    // Les deux appels aboutissent : le perdant de la course retombe sur l'achat
    // du gagnant plutôt que de renvoyer une erreur à un apprenant qui n'a rien
    // fait de mal.
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2)
    const ids = results.map((r) => (r.status === 'fulfilled' ? r.value.purchaseId : null))
    expect(ids[0]).toBe(ids[1])

    expect(await prisma.purchase.count({ where: { learnerId: learner.id, courseId: course.id } })).toBe(1)

    // Et le formateur n'est crédité qu'une fois.
    const wallet = await prisma.wallet.findFirstOrThrow({ where: { trainerId: profile.id } })
    expect(wallet.balance).toBe(Math.round(15000 * 0.85))
  })
})
