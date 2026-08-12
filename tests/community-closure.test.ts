// ==========================================================================
// Fermeture d'une communauté — arbitrage 2
// ==========================================================================
// `Community.status` était testé partout en lecture, et le renouvellement des
// adhésions savait déjà clore celles d'une communauté qui n'est plus `active`.
// Mais rien n'écrivait jamais autre chose que `active` : la porte existait,
// personne ne pouvait la pousser — et la résiliation d'abonnement renvoyait
// donc vers un geste inexistant.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  closeCommunity, reopenCommunity, countActivePaidMembers, updateCommunity,
} from '@/lib/communities'
import {
  initiateMembershipPayment, activateMembershipForPurchase, renewDueMemberships,
} from '@/lib/memberships'

describe('Fermeture d\'une communauté', () => {
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
    const community = await prisma.community.create({
      data: {
        trainerId: trainer.id, name: 'Les artisans du back', slug: 'artisans-back',
        priceFcfa: 5000, commissionRate: 0.15,
      },
    })
    const learner = await prisma.user.create({ data: { email: 'membre@test.com', role: 'LEARNER' } })
    return { trainerUser, trainer, community, learner }
  }

  /** Le parcours complet : paiement ouvert, puis confirmé comme le fait le webhook. */
  async function join(communityId: string, learnerId: string) {
    const intent = await initiateMembershipPayment(communityId, learnerId, 'STRIPE')
    await prisma.$transaction(async (tx) => {
      await tx.purchase.update({
        where: { id: intent.purchaseId },
        data: { providerStatus: 'SUCCEEDED' },
      })
      await activateMembershipForPurchase(tx, intent.purchaseId)
    })
    return intent
  }

  // -------------------------------------------------------------------------
  it('la fermeture ne coupe rien : les adhésions vont à leur terme', async () => {
    const { trainerUser, trainer, community, learner } = await setup()
    await join(community.id, learner.id)

    const result = await closeCommunity(community.id, trainer.id, trainerUser.id)

    expect(result.community.status).toBe('closed')
    // Le membre qui vient de payer son mois le consomme entièrement.
    expect(result.remainingPaidMembers).toBe(1)
    const sub = await prisma.communitySubscription.findFirstOrThrow({
      where: { communityId: community.id, learnerId: learner.id },
    })
    expect(sub.status).toBe('ACTIVE')
  })

  it("aucune adhésion nouvelle une fois fermée", async () => {
    const { trainerUser, trainer, community } = await setup()
    const autre = await prisma.user.create({ data: { email: 'tard@test.com', role: 'LEARNER' } })
    await closeCommunity(community.id, trainer.id, trainerUser.id)

    await expect(initiateMembershipPayment(community.id, autre.id, 'STRIPE'))
      .rejects.toThrow()
  })

  it("l'adhésion s'éteint à son échéance, pas avant", async () => {
    const { trainerUser, trainer, community, learner } = await setup()
    await join(community.id, learner.id)
    await closeCommunity(community.id, trainer.id, trainerUser.id)

    // L'échéance arrive : `renewDueMemberships` sait déjà refermer sur
    // `COMMUNITY_CLOSED`, il lui manquait seulement une communauté fermée.
    await prisma.communitySubscription.updateMany({
      where: { communityId: community.id },
      data: { periodEnd: new Date(Date.now() - 1000) },
    })
    const result = await renewDueMemberships()

    expect(result.closed).toBe(1)
    expect(result.due).toBe(0)
    const sub = await prisma.communitySubscription.findFirstOrThrow({
      where: { communityId: community.id },
    })
    expect(sub.status).toBe('EXPIRED')
    // Plus personne : le formateur peut désormais résilier (arbitrage 2).
    expect(await countActivePaidMembers(trainer.id)).toBe(0)
  })

  it('une communauté fermée ne se modifie plus', async () => {
    const { trainerUser, trainer, community } = await setup()
    await closeCommunity(community.id, trainer.id, trainerUser.id)

    await expect(updateCommunity(community.id, trainer.id, trainerUser.id, { name: 'Nouveau nom' }))
      .rejects.toThrow('COMMUNITY_CLOSED')
  })

  it('la réouverture rend les adhésions possibles, sans ressusciter les anciennes', async () => {
    const { trainerUser, trainer, community, learner } = await setup()
    await join(community.id, learner.id)
    await closeCommunity(community.id, trainer.id, trainerUser.id)
    await prisma.communitySubscription.updateMany({
      where: { communityId: community.id },
      data: { periodEnd: new Date(Date.now() - 1000) },
    })
    await renewDueMemberships()

    await reopenCommunity(community.id, trainer.id, trainerUser.id)

    expect((await prisma.community.findUniqueOrThrow({ where: { id: community.id } })).status).toBe('active')
    // On ne ressuscite pas une relation payante à laquelle personne n'a
    // consenti de nouveau.
    expect((await prisma.communitySubscription.findFirstOrThrow({
      where: { communityId: community.id },
    })).status).toBe('EXPIRED')
  })

  it('fermer deux fois, ou rouvrir une communauté ouverte, est refusé', async () => {
    const { trainerUser, trainer, community } = await setup()

    await expect(reopenCommunity(community.id, trainer.id, trainerUser.id))
      .rejects.toThrow('COMMUNITY_NOT_CLOSED')
    await closeCommunity(community.id, trainer.id, trainerUser.id)
    await expect(closeCommunity(community.id, trainer.id, trainerUser.id))
      .rejects.toThrow('COMMUNITY_ALREADY_CLOSED')
  })

  it('un autre formateur ne ferme pas la communauté de quelqu\'un', async () => {
    const { community } = await setup()
    const autre = await prisma.user.create({ data: { email: 'autre@test.com', role: 'TRAINER' } })
    const autreProfil = await prisma.trainerProfile.create({ data: { userId: autre.id } })

    await expect(closeCommunity(community.id, autreProfil.id, autre.id)).rejects.toThrow('NOT_OWNER')
  })

  // -------------------------------------------------------------------------
  // Ce que « membre actif » veut dire, au sens de l'arbitrage 2.
  it("une adhésion offerte ne retient pas le formateur", async () => {
    const { trainer, community, learner } = await setup()
    // `provider` nul en est la définition : personne n'y a jamais attaché de
    // moyen de paiement, elle ne représente aucun argent en cours.
    await prisma.communitySubscription.create({
      data: {
        communityId: community.id, learnerId: learner.id, status: 'ACTIVE',
        periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * 86_400_000),
        provider: null,
      },
    })

    expect(await countActivePaidMembers(trainer.id)).toBe(0)
  })

  it("une adhésion impayée en sursis retient encore, un membre banni non", async () => {
    const { trainer, community, learner } = await setup()
    await join(community.id, learner.id)

    // En sursis de règlement : l'adhésion court toujours.
    await prisma.communitySubscription.updateMany({
      where: { communityId: community.id }, data: { status: 'PAST_DUE' },
    })
    expect(await countActivePaidMembers(trainer.id)).toBe(1)

    // Banni : il n'est déjà plus reconduit.
    await prisma.communitySubscription.updateMany({
      where: { communityId: community.id }, data: { status: 'BANNED' },
    })
    expect(await countActivePaidMembers(trainer.id)).toBe(0)
  })
})
