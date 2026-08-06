// ==========================================================================
// Suppression de compte — ce qui doit être soldé avant de partir
// ==========================================================================
// `requestDeletion` ne promet un effacement que si personne ne reste en plan.
// Chaque refus protège un tiers : l'autre partie d'un litige, le membre qui
// paie encore, le comptable qui devra retrouver une écriture.
//
// Le premier refus est d'une autre nature : un administrateur ne s'efface pas
// lui-même (arbitrage 88). Ce n'est pas une situation à solder, c'est une
// règle de redevabilité — s'auto-anonymiser reviendrait à retirer sa signature
// des décisions qu'on a prises sur les litiges, les KYC et les retraits.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { requestDeletion } from '@/lib/profile'
import { renewDueMemberships } from '@/lib/memberships'

const JOUR = 86_400_000

describe('Suppression de compte', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function unApprenant(email = 'apprenant@test.com') {
    return prisma.user.create({ data: { email, role: 'LEARNER', fullName: 'Aminata Diallo' } })
  }

  async function unFormateur() {
    const user = await prisma.user.create({
      data: { email: 'formateur@test.com', role: 'TRAINER', fullName: 'Awa Sarr' },
    })
    const profile = await prisma.trainerProfile.create({
      data: { userId: user.id, approvedAt: new Date(), verifiedLegalName: 'Awa Sarr' },
    })
    await prisma.wallet.create({ data: { trainerId: profile.id, balance: 0 } })
    return { user, profile }
  }

  async function uneRessource(trainerId: string, status = 'published') {
    return prisma.course.create({
      data: {
        trainerId, slug: `r-${crypto.randomUUID().slice(0, 8)}`, title: 'Masterclass',
        blurb: 'Accroche', description: 'Description', category: 'dev', format: 'pdf',
        priceFcfa: 10000, status, publishedAt: status === 'published' ? new Date() : null,
        contentS3Key: 'course-assets/x/d.pdf', contentMimeType: 'application/pdf',
      },
    })
  }

  // ── La règle de gouvernance ──────────────────────────────────────────────

  it('refuse la suppression à un compte d’administration', async () => {
    const admin = await prisma.user.create({
      data: { email: 'admin@test.com', role: 'ADMIN', adminRole: 'MODERATION', fullName: 'Sarah' },
    })

    const resultat = await requestDeletion(admin.id, null)

    expect(resultat).toEqual({ ok: false, reason: 'ADMIN_ACCOUNT' })
    const apres = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })
    expect(apres.deletionRequestedAt).toBeNull()
  })

  // ── Le cas nominal ───────────────────────────────────────────────────────

  it('accepte un apprenant qui ne doit rien à personne', async () => {
    const learner = await unApprenant()

    const resultat = await requestDeletion(learner.id, null)

    expect(resultat.ok).toBe(true)
    const apres = await prisma.user.findUniqueOrThrow({ where: { id: learner.id } })
    expect(apres.deletionRequestedAt).not.toBeNull()
  })

  // ── Ce qui doit être soldé ───────────────────────────────────────────────

  it('refuse un apprenant partie à un litige en cours', async () => {
    // Un acheteur peut être en litige sans être formateur : le contrôle ne
    // peut donc pas vivre dans la seule branche `trainerId`.
    const { profile } = await unFormateur()
    const learner = await unApprenant()
    const course = await uneRessource(profile.id)
    const purchase = await prisma.purchase.create({
      data: {
        learnerId: learner.id, trainerId: profile.id, courseId: course.id,
        amountFcfa: 10000, commissionRate: 0.15, trainerShareFcfa: 8500,
        platformShareFcfa: 1500, provider: 'STRIPE',
        providerTransactionId: `tx_${crypto.randomUUID()}`, providerStatus: 'SUCCEEDED',
      },
    })
    await prisma.dispute.create({
      data: {
        purchaseId: purchase.id, learnerId: learner.id, trainerId: profile.id,
        source: 'LEARNER_REQUEST', reason: 'ACCESS_ISSUE', status: 'IN_REVIEW',
        disputedAmountFcfa: 10000, openedAt: new Date(),
      },
    })

    expect(await requestDeletion(learner.id, null)).toEqual({ ok: false, reason: 'OPEN_DISPUTE' })
  })

  it('refuse un formateur au portefeuille non vide', async () => {
    const { user, profile } = await unFormateur()
    await prisma.wallet.update({ where: { trainerId: profile.id }, data: { balance: 25000 } })

    expect(await requestDeletion(user.id, profile.id))
      .toEqual({ ok: false, reason: 'WALLET_NOT_EMPTY' })
  })

  it('refuse un formateur dont un retrait est encore en route', async () => {
    // Le solde peut être nul alors que l'argent n'est pas arrivé : le retrait
    // a déjà débité le portefeuille. Sans ce contrôle, le compte disparaîtrait
    // entre le débit et le versement.
    const { user, profile } = await unFormateur()
    const method = await prisma.payoutMethod.create({
      data: {
        trainerId: profile.id, type: 'MOBILE_MONEY', accountNature: 'INDIVIDUAL',
        verifiedLegalNameAtCreation: 'Awa Sarr', trainerEmailSnapshot: 'formateur@test.com',
      },
    })
    await prisma.payout.create({
      data: {
        trainerId: profile.id, payoutMethodId: method.id, amountFcfa: 50000, status: 'APPROVED',
      },
    })

    expect(await requestDeletion(user.id, profile.id))
      .toEqual({ ok: false, reason: 'PAYOUT_IN_FLIGHT' })
  })

  it('refuse un formateur dont des ressources sont publiées', async () => {
    const { user, profile } = await unFormateur()
    await uneRessource(profile.id, 'published')

    expect(await requestDeletion(user.id, profile.id))
      .toEqual({ ok: false, reason: 'PUBLISHED_COURSES' })
  })

  it('refuse un formateur dont la communauté a encore des membres', async () => {
    const { user, profile } = await unFormateur()
    const membre = await unApprenant('membre@test.com')
    const community = await prisma.community.create({
      data: {
        trainerId: profile.id, name: 'Les artisans', slug: 'artisans',
        priceFcfa: 5000, commissionRate: 0.15, status: 'active',
      },
    })
    await prisma.communitySubscription.create({
      data: {
        communityId: community.id, learnerId: membre.id, status: 'ACTIVE',
        periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * JOUR),
      },
    })

    expect(await requestDeletion(user.id, profile.id))
      .toEqual({ ok: false, reason: 'ACTIVE_COMMUNITY' })
  })

  it('accepte un formateur dont la communauté est vide', async () => {
    // Le refus vise les membres à prévenir, pas la communauté en elle-même :
    // un salon sans personne ne retient personne.
    const { user, profile } = await unFormateur()
    await prisma.community.create({
      data: {
        trainerId: profile.id, name: 'Salon désert', slug: 'desert',
        priceFcfa: 5000, commissionRate: 0.15, status: 'active',
      },
    })

    expect((await requestDeletion(user.id, profile.id)).ok).toBe(true)
  })

  // ── Après l'effacement ───────────────────────────────────────────────────

  it('cesse de renouveler l’adhésion d’un compte effacé', async () => {
    // Sans le filtre `deletedAt`, le job rouvrait chaque mois une échéance au
    // nom de quelqu'un qui n'existe plus, et tentait de la prélever.
    const { profile } = await unFormateur()
    const community = await prisma.community.create({
      data: {
        trainerId: profile.id, name: 'Les artisans', slug: 'artisans',
        priceFcfa: 5000, commissionRate: 0.15, status: 'active',
      },
    })
    const parti = await prisma.user.create({
      data: {
        email: 'supprime-x@nkamva.invalid', role: 'LEARNER',
        deletionRequestedAt: new Date(Date.now() - 40 * JOUR),
        deletedAt: new Date(),
      },
    })
    await prisma.communitySubscription.create({
      data: {
        communityId: community.id, learnerId: parti.id, status: 'ACTIVE',
        periodStart: new Date(Date.now() - 60 * JOUR),
        periodEnd: new Date(Date.now() - JOUR),
      },
    })

    const bilan = await renewDueMemberships(new Date())

    expect(bilan.due).toBe(0)
    expect(bilan.ended).toBe(0)
    expect(bilan.closed).toBe(0)
  })

  it('renouvelle encore pendant le délai de grâce', async () => {
    // Une demande de suppression n'est pas un départ : la personne a payé sa
    // période, et peut encore annuler. Seule l'anonymisation met fin au lien.
    const { profile } = await unFormateur()
    const community = await prisma.community.create({
      data: {
        trainerId: profile.id, name: 'Les artisans', slug: 'artisans',
        priceFcfa: 5000, commissionRate: 0.15, status: 'active',
      },
    })
    const partant = await prisma.user.create({
      data: {
        email: 'partant@test.com', role: 'LEARNER',
        deletionRequestedAt: new Date(),
        deletedAt: null,
      },
    })
    await prisma.communitySubscription.create({
      data: {
        communityId: community.id, learnerId: partant.id, status: 'ACTIVE',
        periodStart: new Date(Date.now() - 60 * JOUR),
        periodEnd: new Date(Date.now() - JOUR),
      },
    })

    const bilan = await renewDueMemberships(new Date())

    expect(bilan.due + bilan.ended + bilan.closed).toBeGreaterThan(0)
  })
})
