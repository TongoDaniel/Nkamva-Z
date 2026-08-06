// ==========================================================================
// La frontière entre l'administration et le reste de la plateforme
// ==========================================================================
// Règle : un administrateur n'est qu'un administrateur. Il n'achète pas,
// n'adhère à aucune communauté, n'accepte pas d'invitation, ne candidate pas.
// Motif : ce sont les mêmes personnes qui tranchent les litiges, valident les
// dossiers KYC et libèrent les retraits. Voir `src/lib/roles.ts`.
//
// Ce fichier tient les DEUX versants, et le second compte autant que le
// premier : le formateur conserve l'intégralité des privilèges de l'apprenant.
// Sans les tests « le formateur peut », un futur resserrement de la règle les
// lui retirerait sans que rien ne proteste — c'est précisément la stratégie
// qui a été écartée.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { canActAsLearner, ADMIN_CANNOT_ACT_AS_LEARNER } from '@/lib/roles'
import { initiatePurchase } from '@/lib/purchases'
import { initiateMembershipPayment } from '@/lib/memberships'
import { issueNominativeInvitation, acceptGiftInvitation } from '@/lib/invitations'
import { createApplication } from '@/lib/trainer-applications'

describe("Cloisonnement de l'administration", () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  /** Un formateur, sa communauté, une ressource vendue à l'unité. */
  async function unFormateur(suffixe: string) {
    const user = await prisma.user.create({
      data: {
        email: `formateur-${suffixe}@test.com`, role: 'TRAINER',
        fullName: `Formateur ${suffixe}`, emailVerifiedAt: new Date(),
      },
    })
    const profile = await prisma.trainerProfile.create({
      data: { userId: user.id, approvedAt: new Date() },
    })
    await prisma.wallet.create({ data: { trainerId: profile.id, balance: 0 } })
    const community = await prisma.community.create({
      data: {
        trainerId: profile.id, name: `Salon ${suffixe}`, slug: `salon-${suffixe}`,
        priceFcfa: 5000, commissionRate: 0.15,
      },
    })
    const course = await prisma.course.create({
      data: {
        trainerId: profile.id, slug: `ressource-${suffixe}`, title: `Ressource ${suffixe}`,
        blurb: 'Accroche', description: 'Description', category: 'dev', format: 'pdf',
        priceFcfa: 10000, status: 'published', publishedAt: new Date(),
        contentS3Key: `course-assets/${suffixe}/d.pdf`, contentMimeType: 'application/pdf',
      },
    })
    return { user, profile, community, course }
  }

  async function unAdmin() {
    return prisma.user.create({
      data: {
        email: 'admin@test.com', role: 'ADMIN', adminRole: 'SUPER_ADMIN',
        fullName: 'Diane Ekwalla', emailVerifiedAt: new Date(),
      },
    })
  }

  // ── Le prédicat lui-même ─────────────────────────────────────────────────
  // `PENDING_TRAINER` mérite sa ligne : une candidature en cours d'instruction
  // ne retire rien: la personne continue d'acheter pendant qu'on l'examine.
  it('n’écarte que le rôle ADMIN', () => {
    expect(canActAsLearner('LEARNER')).toBe(true)
    expect(canActAsLearner('PENDING_TRAINER')).toBe(true)
    expect(canActAsLearner('TRAINER')).toBe(true)
    expect(canActAsLearner('ADMIN')).toBe(false)
  })

  // ── Ce que l'administration ne peut pas ──────────────────────────────────

  it('refuse l’achat d’une ressource à un administrateur', async () => {
    const { course } = await unFormateur('a')
    const admin = await unAdmin()

    await expect(initiatePurchase(course.id, admin.id, 'STRIPE'))
      .rejects.toThrow(ADMIN_CANNOT_ACT_AS_LEARNER)

    // Le refus tombe AVANT toute écriture : aucune intention de paiement ne
    // doit rester derrière lui, sans quoi elle serait réconciliée plus tard.
    expect(await prisma.purchase.count({ where: { learnerId: admin.id } })).toBe(0)
  })

  it('refuse l’adhésion à une communauté à un administrateur', async () => {
    const { community } = await unFormateur('b')
    const admin = await unAdmin()

    await expect(initiateMembershipPayment(community.id, admin.id, 'STRIPE'))
      .rejects.toThrow(ADMIN_CANNOT_ACT_AS_LEARNER)

    expect(await prisma.communitySubscription.count({ where: { learnerId: admin.id } })).toBe(0)
  })

  it('refuse l’invitation offerte à un administrateur', async () => {
    // Le chemin de contournement le plus simple : ne pas payer, se faire
    // inviter. Il doit être fermé comme le tunnel payant.
    const { user: formateur, community } = await unFormateur('c')
    const admin = await unAdmin()

    const { token } = await issueNominativeInvitation({
      communityId: community.id,
      issuerId: formateur.id,
      email: admin.email,
      grant: 'GIFT',
      giftMonths: 1,
    })

    await expect(acceptGiftInvitation(token, admin.id))
      .rejects.toThrow(ADMIN_CANNOT_ACT_AS_LEARNER)

    // L'invitation n'a pas été consommée : elle reste utilisable par quelqu'un
    // qui, lui, a le droit de l'accepter.
    const invitation = await prisma.communityInvitation.findFirst({
      where: { communityId: community.id },
      select: { acceptedAt: true, usesCount: true },
    })
    expect(invitation?.acceptedAt).toBeNull()
    expect(invitation?.usesCount).toBe(0)
  })

  it('refuse la candidature au statut de formateur à un administrateur', async () => {
    const admin = await unAdmin()

    await expect(createApplication(admin.id, { slogan: 'Bonjour' }))
      .rejects.toThrow(ADMIN_CANNOT_ACT_AS_LEARNER)

    expect(await prisma.trainerApplication.count({ where: { userId: admin.id } })).toBe(0)
  })

  // ── Ce que le formateur peut, et doit continuer de pouvoir ───────────────

  it('laisse un formateur acheter la ressource d’un autre', async () => {
    const auteur = await unFormateur('d')
    const acheteur = await unFormateur('e')

    const intent = await initiatePurchase(auteur.course.id, acheteur.user.id, 'STRIPE')
    expect(intent).toBeTruthy()
    expect(await prisma.purchase.count({ where: { learnerId: acheteur.user.id } })).toBe(1)
  })

  it('laisse un formateur adhérer à la communauté d’un autre', async () => {
    // La stratégie retenue : le conflit d'intérêts vise l'arbitre, pas le
    // concurrent. Un formateur reste un apprenant comme un autre.
    const hote = await unFormateur('f')
    const visiteur = await unFormateur('g')

    const intent = await initiateMembershipPayment(hote.community.id, visiteur.user.id, 'STRIPE')
    expect(intent.purchaseId).toBeTruthy()
  })

  it('refuse toujours à un formateur d’adhérer à sa propre communauté', async () => {
    // Règle antérieure, sans rapport avec le conflit d'intérêts : s'abonner
    // chez soi reviendrait à se payer une commission. Elle doit survivre.
    const { user, community } = await unFormateur('h')

    await expect(initiateMembershipPayment(community.id, user.id, 'STRIPE'))
      .rejects.toThrow('CANNOT_JOIN_OWN_COMMUNITY')
  })
})
