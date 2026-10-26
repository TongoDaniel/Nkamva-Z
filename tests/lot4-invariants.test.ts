// ==========================================================================
// Lot 4 — Tests du parcours cœur (catalogue, achat, accès)
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { searchCourses, getPublicCourse } from '@/lib/catalog'
import { createCourse, publishCourse } from '@/lib/courses'
import { initiatePurchase, reconcilePurchase } from '@/lib/purchases'
import { checkCourseAccess, updateWatchProgress, markCourseDownloaded, getConsumptionPercent } from '@/lib/access'
import { POST as stripeWebhookHandler } from '@/app/api/webhooks/stripe/route'
import { POST as pawapayDepositHandler } from '@/app/api/webhooks/pawapay/deposits/route'

/**
 * Un Stripe Checkout simulé, qu'un test allume quand il veut le vrai parcours
 * par carte : une session `cs_…` ouverte, un achat qui reste en attente, puis
 * une session payée dont le PaymentIntent `pi_…` remplace le `cs_…`. Éteint, le
 * client réel reste absent et la simulation de paiement règle sur-le-champ.
 *
 * Ces tests posaient autrefois une fausse clé dans l'environnement : depuis le
 * passage à Checkout, le client réel partait chez Stripe et revenait en
 * « Invalid API Key ».
 */
const stripeCheckout = vi.hoisted(() => ({ enabled: false }))
vi.mock('@/lib/stripe', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/stripe')>()
  const fake = {
    checkout: {
      sessions: {
        create: async () => {
          const id = `cs_test_${crypto.randomUUID()}`
          return { id, url: `https://checkout.stripe.test/${id}` }
        },
        retrieve: async (id: string) => ({
          id,
          payment_status: 'paid',
          payment_intent: `pi_${id.slice('cs_test_'.length)}`,
        }),
      },
    },
  }
  return {
    ...real,
    getStripe: () => stripeCheckout.enabled
      ? (fake as unknown as ReturnType<typeof real.getStripe>)
      : real.getStripe(),
  }
})

/** Ce que Stripe envoie quand une session Checkout est payée. */
function checkoutCompletedRequest(sessionId: string) {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'checkout.session.completed',
      data: { object: { id: sessionId, payment_status: 'paid' } },
    }),
  })
}

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

/**
 * Une ressource ne peut plus être publiée sans contenu : `publishCourse` refuse
 * en `CONTENT_REQUIRED`. Les fixtures posent donc la clé directement, sans
 * repasser par la présignature.
 */
/**
 * Ce que `confirmCourseUpload` écrit pour une vidéo : la clé, la taille, le type
 * — et la **durée mesurée sur le fichier** (F3.8). Les tests ne téléversent
 * rien, ils posent donc eux-mêmes le résultat de cette mesure ; sans elle, le
 * seuil de consommation d'un litige n'aurait rien à diviser.
 */
async function withContent(courseId: string, durationSeconds = 14400) {
  await prisma.course.update({
    where: { id: courseId },
    data: {
      contentS3Key: `course-assets/${courseId}/video-fixture.mp4`,
      contentSizeBytes: 1024,
      contentMimeType: 'video/mp4',
      durationSeconds,
    },
  })
}
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => {
    stripeCheckout.enabled = false
    await cleanDatabase()
  })

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
    })
    await withContent(course.id, opts.duration || 14400) // 4 h par défaut
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
      await withContent(c.id)
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

    // Initier l'achat : sans client Stripe, la simulation de paiement
    // (ALLOW_PAYMENT_SIMULATION, posée par tests/setup) règle sur-le-champ, sans
    // passer par aucun webhook — voir settleWithoutProvider dans purchases.ts.
    // L'identifiant est opaque : ce n'est pas un objet Stripe, et il ne doit
    // pas en avoir l'air.
    const result = await initiatePurchase(course.id, learner.id, 'STRIPE')
    expect(result.provider).toBe('STRIPE')
    expect(result.nextStep).toBe('ALREADY_SETTLED')
    expect(result.providerTransactionId).not.toMatch(/^(cs|pi)_/)

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
  it('achat PawaPay complet : initiation → crédit wallet', async () => {
    const { profile, course } = await setupTrainerWithCourse({ price: 8000 })
    const learner = await prisma.user.create({ data: { email: 'learner@test.com', role: 'LEARNER' } })

    const result = await initiatePurchase(course.id, learner.id, 'PAWAPAY')
    expect(result.provider).toBe('PAWAPAY')
    // L'identifiant est un UUID nu : PawaPay impose ce format, et l'ancien
    // préfixe `cp_` aurait fait rejeter le dépôt.
    expect(result.providerTransactionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )

    const wallet = await prisma.wallet.findUnique({ where: { trainerId: profile.id } })
    expect(wallet?.balance).toBe(6800) // 85% de 8000
  })

  // -------------------------------------------------------------------------
  // Le webhook CinetPay qu'on remplace acceptait n'importe quel POST anonyme
  // dès que sa clé secrète manquait. Celui-ci refuse par défaut : c'est
  // l'invariant qui compte, et il doit tenir même sans configuration.
  it('callback PawaPay non signé : refusé, aucun crédit', async () => {
    const res = await pawapayDepositHandler(
      new Request('http://localhost/api/webhooks/pawapay/deposits', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ depositId: crypto.randomUUID(), status: 'COMPLETED' }),
      }),
    )
    expect(res.status).toBeGreaterThanOrEqual(400)

    // Le rejet est journalisé sans être attendu (pawapay-callbacks.ts) : la
    // réponse peut partir avant l'écriture. On attend donc qu'elle arrive.
    await vi.waitFor(async () => {
      const rejected = await prisma.auditLog.count({ where: { action: 'PAWAPAY_CALLBACK_REJECTED' } })
      expect(rejected).toBe(1)
    })
  })

  // -------------------------------------------------------------------------
  it('paiement non confirmé : sans appel webhook, aucun wallet crédité', async () => {
    const { profile, course } = await setupTrainerWithCourse({ price: 10000 })
    const learner = await prisma.user.create({ data: { email: 'learner@test.com', role: 'LEARNER' } })

    // Client Stripe présent → initiatePurchase ne simule plus rien, la Purchase
    // reste PENDING tant que le webhook n'a pas confirmé le paiement.
    stripeCheckout.enabled = true
    const result = await initiatePurchase(course.id, learner.id, 'STRIPE')
    expect(result.nextStep).toBe('REDIRECT_TO_PROVIDER')
    expect(result.providerTransactionId).toMatch(/^cs_/)

    const purchase = await prisma.purchase.findUnique({ where: { id: result.purchaseId } })
    expect(purchase?.providerStatus).toBe('PENDING')

    const walletBefore = await prisma.wallet.findUnique({ where: { trainerId: profile.id } })
    expect(walletBefore?.balance).toBe(0)

    // Le webhook confirme enfin le paiement → c'est seulement là que le wallet est crédité,
    // et l'achat prend l'identifiant `pi_…` sur lequel litiges et remboursements s'indexent.
    const res = await stripeWebhookHandler(checkoutCompletedRequest(result.providerTransactionId))
    expect(res.status).toBe(200)

    const settled = await prisma.purchase.findUnique({ where: { id: result.purchaseId } })
    expect(settled?.providerStatus).toBe('SUCCEEDED')
    expect(settled?.providerTransactionId).toMatch(/^pi_/)

    const walletAfter = await prisma.wallet.findUnique({ where: { trainerId: profile.id } })
    expect(walletAfter?.balance).toBe(8500) // 85% de 10000
  })

  // -------------------------------------------------------------------------
  it('webhook Stripe rejoué deux fois → wallet crédité une seule fois', async () => {
    const { profile, course } = await setupTrainerWithCourse({ price: 10000 })
    const learner = await prisma.user.create({ data: { email: 'learner@test.com', role: 'LEARNER' } })

    stripeCheckout.enabled = true
    const result = await initiatePurchase(course.id, learner.id, 'STRIPE')
    expect(result.nextStep).toBe('REDIRECT_TO_PROVIDER')
    expect(result.providerTransactionId).toMatch(/^cs_/)

    // Le même événement webhook est livré deux fois (cas réel : retry provider),
    // puis l'événement du PaymentIntent arrive à son tour sur l'achat promu.
    await stripeWebhookHandler(checkoutCompletedRequest(result.providerTransactionId))
    await stripeWebhookHandler(checkoutCompletedRequest(result.providerTransactionId))
    const promoted = await prisma.purchase.findUniqueOrThrow({ where: { id: result.purchaseId } })
    await stripeWebhookHandler(stripeSucceededRequest(promoted.providerTransactionId!))

    // Le wallet ne doit pas avoir été crédité deux fois
    const wallet = await prisma.wallet.findUnique({ where: { trainerId: profile.id } })
    expect(wallet?.balance).toBe(8500) // toujours 8500, pas 17000

    // Un audit WEBHOOK_DUPLICATE_IGNORED par livraison en trop : la session
    // rejouée, puis l'événement du PaymentIntent sur un achat déjà crédité.
    const auditCount = await prisma.auditLog.count({
      where: { action: 'WEBHOOK_DUPLICATE_IGNORED' },
    })
    expect(auditCount).toBe(2)
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
    await withContent(course.id)
    await publishCourse(course.id, profile.id, 'trainer-id')

    const learner = await prisma.user.create({ data: { email: 'learner@test.com', role: 'LEARNER' } })
    await initiatePurchase(course.id, learner.id, 'PAWAPAY')

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

    // Le parcours carte réel : chaque appel ouvrirait une session et laisserait
    // un achat en attente. Sous la simulation, le premier réglait sur-le-champ
    // et le second tombait, à bon droit, sur ALREADY_PURCHASED.
    stripeCheckout.enabled = true
    const results = await Promise.allSettled([
      initiatePurchase(course.id, learner.id, 'STRIPE'),
      initiatePurchase(course.id, learner.id, 'STRIPE'),
    ])

    // Au moins un appel aboutit. Le perdant, s'il arrive pendant que le gagnant
    // ouvre sa session, est refusé en PAYMENT_IN_PROGRESS : la page Checkout
    // appartient à l'onglet gagnant, lui en ouvrir une autre l'expirerait (voir
    // initiatePurchase). S'il arrive après, la reprise lui rend le même achat.
    // Jamais d'autre erreur, et jamais deux achats.
    const fulfilled = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
    expect(fulfilled.length).toBeGreaterThanOrEqual(1)
    expect(new Set(fulfilled.map((r) => r.purchaseId)).size).toBe(1)
    for (const r of results) {
      if (r.status === 'rejected') expect((r.reason as Error).message).toBe('PAYMENT_IN_PROGRESS')
    }

    expect(await prisma.purchase.count({ where: { learnerId: learner.id, courseId: course.id } })).toBe(1)

    // Et le formateur n'est crédité qu'une fois, quand la session aboutit.
    const purchase = await prisma.purchase.findFirstOrThrow({ where: { learnerId: learner.id, courseId: course.id } })
    await stripeWebhookHandler(checkoutCompletedRequest(purchase.providerTransactionId!))
    const wallet = await prisma.wallet.findFirstOrThrow({ where: { trainerId: profile.id } })
    expect(wallet.balance).toBe(Math.round(15000 * 0.85))
  })
})
