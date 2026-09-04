// ==========================================================================
// Lot 2 — Les annonces d'un achat encaissé (F12.5 à F12.7, arbitrage 119)
// ==========================================================================
// Deux règles se vérifient ici, et la seconde est la vraie raison d'être du
// fichier.
//
// **Les deux parties sont prévenues.** Avant ce lot, aucun `notify()` ne se
// trouvait sur le chemin d'un achat : un formateur ne pouvait apprendre une
// vente qu'en allant regarder son tableau de bord. C'est le constat 7 de
// l'audit du 1er septembre.
//
// **Une action ne produit jamais deux notifications** (F12.7). Cinq chemins
// créditent un achat — deux webhooks Stripe, celui de PawaPay, la
// réconciliation, et le règlement simulé du mode développement. Ils convergent
// tous vers `onPurchaseSettled`, pendu à la branche `credited` de
// `creditWalletOnPurchase`, qui n'est vraie qu'une fois. Rejouer un webhook ne
// doit donc rien réémettre — et c'est exactement ce qu'un fournisseur de
// paiement fait quand il n'est pas sûr d'avoir été entendu.
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { createCourse, publishCourse } from '@/lib/courses'
import { initiatePurchase } from '@/lib/purchases'
import { POST as stripeWebhookHandler } from '@/app/api/webhooks/stripe/route'

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

describe("Lot 2 — annonces d'un achat encaissé", () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup(priceFcfa = 20000) {
    const trainer = await prisma.user.create({
      data: { email: 'formatrice@test.com', role: 'TRAINER', fullName: 'Aminata' },
    })
    const profile = await prisma.trainerProfile.create({
      data: {
        userId: trainer.id,
        verifiedLegalName: 'Aminata Diallo',
        approvedAt: new Date(Date.now() - 40 * 86400000),
      },
    })
    await prisma.wallet.create({ data: { trainerId: profile.id, balance: 0 } })

    const course = await createCourse(profile.id, trainer.id, {
      title: 'Architecture logicielle',
      blurb: 'Patterns et DDD',
      description: 'Un cours complet sur les patterns et le DDD.',
      category: 'dev',
      format: 'video',
      priceFcfa,
      level: 'Avancé',
      durationSeconds: 14400,
    })
    await prisma.course.update({
      where: { id: course.id },
      data: {
        contentS3Key: `course-assets/${course.id}/video-fixture.mp4`,
        contentSizeBytes: 1024,
        contentMimeType: 'video/mp4',
      },
    })
    await publishCourse(course.id, profile.id, trainer.id)

    const learner = await prisma.user.create({
      data: { email: 'apprenant@test.com', role: 'LEARNER', fullName: 'Ibrahim' },
    })
    return { trainer, profile, course, learner }
  }

  /** Les notifications d'un utilisateur, par type. */
  async function typesFor(userId: string) {
    const rows = await prisma.notification.findMany({
      where: { userId },
      select: { type: true, body: true, link: true },
      orderBy: { createdAt: 'asc' },
    })
    return rows
  }

  it('prévient les deux parties : un reçu pour l\'acheteur, une vente pour le formateur', async () => {
    const { trainer, course, learner } = await setup(20000)
    await initiatePurchase(course.id, learner.id, 'STRIPE')

    const acheteur = await typesFor(learner.id)
    const formateur = await typesFor(trainer.id)

    expect(acheteur.map((n) => n.type)).toContain('PURCHASE_CONFIRMED')
    expect(formateur.map((n) => n.type)).toContain('COURSE_SOLD')
  })

  it('nomme les trois montants au formateur, pour qu\'il ne les calcule pas', async () => {
    const { trainer, course, learner } = await setup(20000)
    await initiatePurchase(course.id, learner.id, 'STRIPE')

    const vente = (await typesFor(trainer.id)).find((n) => n.type === 'COURSE_SOLD')
    expect(vente).toBeDefined()
    // 20 000 encaissés, 15 % de commission : 3 000 retenus, 17 000 pour lui.
    expect(vente!.body).toContain('20')
    expect(vente!.body).toContain('3')
    expect(vente!.body).toContain('17')
  })

  it('renvoie le formateur vers un écran qui existe', async () => {
    const { trainer, course, learner } = await setup()
    await initiatePurchase(course.id, learner.id, 'STRIPE')

    const vente = (await typesFor(trainer.id)).find((n) => n.type === 'COURSE_SOLD')
    expect(vente!.link).toBe('/formateur/ventes')

    // L'assertion précédente ne dirait rien si la route disparaissait : c'est
    // exactement ainsi que `/formateur/invitations` est resté mort des mois.
    // On vérifie donc que la page est réellement là.
    const { existsSync } = await import('fs')
    expect(existsSync('src/app/(app)/formateur/ventes/page.tsx')).toBe(true)
  })

  it('un webhook rejoué ne produit aucune seconde notification (F12.7)', async () => {
    const { trainer, course, learner } = await setup()
    await initiatePurchase(course.id, learner.id, 'STRIPE')

    const purchase = await prisma.purchase.findFirstOrThrow({
      where: { courseId: course.id, learnerId: learner.id },
      select: { providerTransactionId: true },
    })

    const avantAcheteur = (await typesFor(learner.id)).length
    const avantFormateur = (await typesFor(trainer.id)).length
    expect(avantAcheteur).toBeGreaterThan(0)
    expect(avantFormateur).toBeGreaterThan(0)

    // Deux rejeux : c'est ce que fait un fournisseur qui n'est pas sûr d'avoir
    // été entendu.
    await stripeWebhookHandler(stripeSucceededRequest(purchase.providerTransactionId!))
    await stripeWebhookHandler(stripeSucceededRequest(purchase.providerTransactionId!))

    expect((await typesFor(learner.id)).length).toBe(avantAcheteur)
    expect((await typesFor(trainer.id)).length).toBe(avantFormateur)
  })

  it('un achat de ressource ne se déguise pas en adhésion', async () => {
    const { learner, course } = await setup()
    await initiatePurchase(course.id, learner.id, 'STRIPE')

    const recu = (await typesFor(learner.id)).find((n) => n.type === 'PURCHASE_CONFIRMED')
    expect(recu!.link).toBe('/mes-ressources')
    expect((await typesFor(learner.id)).map((n) => n.type)).not.toContain('MEMBERSHIP_STARTED')
  })
})
