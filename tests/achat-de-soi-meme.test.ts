// ==========================================================================
// On ne s'achète pas à soi-même
// ==========================================================================
// `initiateMembershipPayment` refusait depuis toujours l'adhésion à sa propre
// communauté (`CANNOT_JOIN_OWN_COMMUNITY`). Le pendant manquait sur la vente à
// l'unité : `initiatePurchase` ne mentionnait `trainerId` qu'à l'écriture de
// l'achat et n'a jamais comparé l'acheteur à l'auteur. Le tunnel /achat/[slug]
// était donc ouvert sur sa propre publication.
//
// Ce que coûtait le trou, et pourquoi ces tests portent aussi sur les chiffres :
//   · la commission de la plateforme était prélevée sur son propre argent ;
//   · un `Purchase` auto-référencé entrait dans les agrégats de
//     `trainer-stats.ts` — ventes et revenus nets gonflés par une vente qui
//     n'en est pas une ;
//   · il ouvrait ensuite un litige contre soi-même.
//
// Le versant complémentaire compte autant : un formateur garde TOUS les
// privilèges de l'apprenant, il achète chez les autres. Sans le test qui le
// dit, un futur resserrement le lui retirerait sans que rien ne proteste.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { initiatePurchase } from '@/lib/purchases'
import { initiateMembershipPayment } from '@/lib/memberships'
import { openDispute } from '@/lib/disputes'
import { getTrainerOverview, getSalesByCourse } from '@/lib/trainer-stats'

const PRIX = 10_000
const COMMISSION = 0.15

describe('On ne s’achète pas à soi-même', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  /** Un formateur, son portefeuille, sa communauté, sa ressource publiée. */
  async function unFormateur(suffixe: string) {
    const user = await prisma.user.create({
      data: {
        email: `formateur-${suffixe}@test.com`, role: 'TRAINER',
        fullName: `Formateur ${suffixe}`, emailVerifiedAt: new Date(),
      },
    })
    const profile = await prisma.trainerProfile.create({
      data: { userId: user.id, approvedAt: new Date(), commissionRate: COMMISSION },
    })
    await prisma.wallet.create({ data: { trainerId: profile.id, balance: 0 } })
    const community = await prisma.community.create({
      data: {
        trainerId: profile.id, name: `Salon ${suffixe}`, slug: `salon-${suffixe}`,
        priceFcfa: 5000, commissionRate: COMMISSION,
      },
    })
    const course = await prisma.course.create({
      data: {
        trainerId: profile.id, slug: `ressource-${suffixe}`, title: `Ressource ${suffixe}`,
        blurb: 'Accroche', description: 'Description', category: 'dev', format: 'pdf',
        priceFcfa: PRIX, status: 'published', publishedAt: new Date(),
        contentS3Key: `course-assets/${suffixe}/d.pdf`, contentMimeType: 'application/pdf',
      },
    })
    return { user, profile, community, course }
  }

  // ── La garde elle-même ───────────────────────────────────────────────────

  it('refuse au formateur l’achat de sa propre ressource', async () => {
    const { user, course } = await unFormateur('a')

    await expect(initiatePurchase(course.id, user.id, 'STRIPE'))
      .rejects.toThrow('CANNOT_BUY_OWN_COURSE')
  })

  it('refuse AVANT toute écriture : aucun achat ne reste derrière le refus', async () => {
    // Le point décisif. Une ligne `Purchase` laissée en PENDING serait
    // réconciliée plus tard, et l'index unique partiel
    // `purchases_active_course_unique` bloquerait toute reprise. Une intention
    // de paiement ouverte chez le fournisseur, elle, serait facturée.
    const { user, course } = await unFormateur('b')

    await expect(initiatePurchase(course.id, user.id, 'STRIPE')).rejects.toThrow()

    expect(await prisma.purchase.count({ where: { learnerId: user.id } })).toBe(0)
    expect(await prisma.purchase.count({ where: { courseId: course.id } })).toBe(0)
  })

  it('vaut pour le mobile money comme pour la carte', async () => {
    // La garde est dans le service, pas dans le chemin d'un fournisseur : elle
    // tombe avant même que le moyen de paiement entre en jeu.
    const { user, course } = await unFormateur('c')

    await expect(
      initiatePurchase(course.id, user.id, 'PAWAPAY', {
        phoneNumber: '699123456', provider: 'MTN_MOMO_CMR',
      }),
    ).rejects.toThrow('CANNOT_BUY_OWN_COURSE')
  })

  // ── Ce que le refus protège : les chiffres du formateur ──────────────────

  it('laisse les ventes et le revenu net à zéro', async () => {
    const { user, profile, course } = await unFormateur('d')

    await expect(initiatePurchase(course.id, user.id, 'STRIPE')).rejects.toThrow()

    const overview = await getTrainerOverview(profile.id)
    expect(overview.salesCount).toBe(0)
    expect(overview.netRevenueFcfa).toBe(0)
    expect(overview.walletBalanceFcfa).toBe(0)

    expect(await getSalesByCourse(profile.id)).toEqual(new Map())
  })

  // ── Ce que le formateur peut, et doit continuer de pouvoir ──────────────

  it('laisse un formateur acheter la ressource d’un autre', async () => {
    const auteur = await unFormateur('e')
    const acheteur = await unFormateur('f')

    const intent = await initiatePurchase(auteur.course.id, acheteur.user.id, 'STRIPE')
    expect(intent.purchaseId).toBeTruthy()

    // Et cette vente-là, elle, compte — chez l'auteur, pas chez l'acheteur.
    expect((await getTrainerOverview(auteur.profile.id)).salesCount).toBe(1)
    expect((await getTrainerOverview(acheteur.profile.id)).salesCount).toBe(0)
  })

  // ── Le pendant côté communauté ───────────────────────────────────────────

  it('refuse au formateur l’adhésion à sa propre communauté', async () => {
    // Règle antérieure, déjà tenue par `initiateMembershipPayment`. Elle est
    // rejouée ici pour que les deux versants d'une même règle se lisent
    // ensemble : le jour où l'un est déplacé, l'autre proteste.
    const { user, community } = await unFormateur('g')

    await expect(initiateMembershipPayment(community.id, user.id, 'STRIPE'))
      .rejects.toThrow('CANNOT_JOIN_OWN_COMMUNITY')

    expect(await prisma.purchase.count({ where: { communityId: community.id } })).toBe(0)
  })

  it('laisse un formateur adhérer à la communauté d’un autre', async () => {
    const hote = await unFormateur('h')
    const visiteur = await unFormateur('i')

    const intent = await initiateMembershipPayment(hote.community.id, visiteur.user.id, 'STRIPE')
    expect(intent.purchaseId).toBeTruthy()
  })

  // ── Litige contre soi-même ───────────────────────────────────────────────

  it('refuse d’ouvrir un litige sur sa propre vente', async () => {
    // Plus aucun achat auto-référencé ne naît, mais ceux qui ont pu naître
    // avant la garde vivent encore en base : cet achat est donc écrit
    // directement, comme l'aurait laissé l'ancien tunnel. Instruire un dossier
    // où l'apprenant et le formateur sont la même personne ferait réserver des
    // fonds contre son propre portefeuille.
    const { user, profile, course } = await unFormateur('j')

    const achat = await prisma.purchase.create({
      data: {
        learnerId: user.id, trainerId: profile.id, courseId: course.id,
        amountFcfa: PRIX, commissionRate: COMMISSION,
        trainerShareFcfa: Math.round(PRIX * (1 - COMMISSION)),
        platformShareFcfa: PRIX - Math.round(PRIX * (1 - COMMISSION)),
        provider: 'STRIPE', providerTransactionId: `pi_${crypto.randomUUID()}`,
        providerStatus: 'SUCCEEDED',
      },
    })

    await expect(openDispute(user.id, { purchaseId: achat.id, reason: 'CONTENT_MISMATCH' }))
      .rejects.toThrow('CANNOT_DISPUTE_OWN_SALE')

    expect(await prisma.dispute.count()).toBe(0)
    expect(await prisma.fundReservation.count()).toBe(0)
  })
})
