// ==========================================================================
// Communauté d'un formateur suspendu — campagne du 12 octobre 2026, M3
// ==========================================================================
// Pendant la suspension d'une formatrice (ressources archivées, publication
// bloquée), sa fiche communauté affichait toujours « Rejoindre — 2 500 FCFA /
// mois ». Un apprenant a adhéré, payé, et crédité le portefeuille de la
// formatrice suspendue — alors que le message de suspension disait « Vos
// ressources ne sont plus en vente ».
//
// La règle posée : on n'entre plus, mais qui est déjà là garde sa place, et un
// membre en impayé règle toujours son mois.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { initiateMembershipPayment, activateMembershipForPurchase, renewDueMemberships } from '@/lib/memberships'
import { getPublicCommunity, listPublicCommunities } from '@/lib/communities'
import { searchEverything } from '@/lib/search'

const DAY = 86_400_000

describe('M3 — un formateur suspendu n\'accueille plus de nouveaux membres', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup(trainer: { subscriptionStatus?: 'ACTIVE' | 'SUSPENDED' | 'CANCELED'; suspendedAt?: Date | null } = {}) {
    const trainerUser = await prisma.user.create({
      data: { email: 'formatrice@test.com', role: 'TRAINER', fullName: 'Mariam Diallo' },
    })
    const profile = await prisma.trainerProfile.create({
      data: {
        userId: trainerUser.id, approvedAt: new Date(),
        subscriptionStatus: trainer.subscriptionStatus ?? 'ACTIVE',
        suspendedAt: trainer.suspendedAt ?? null,
      },
    })
    await prisma.wallet.create({ data: { trainerId: profile.id, balance: 0 } })
    const community = await prisma.community.create({
      data: { trainerId: profile.id, name: 'Atelier couture', slug: 'atelier-couture', priceFcfa: 2500 },
    })
    const learner = await prisma.user.create({ data: { email: 'paul@test.com', role: 'LEARNER' } })
    return { profile, community, learner }
  }

  it('une formatrice à jour accueille, et sa fiche le dit', async () => {
    const { community, learner } = await setup()

    expect((await getPublicCommunity(community.slug))!.acceptsMembers).toBe(true)
    const intent = await initiateMembershipPayment(community.id, learner.id, 'STRIPE')
    expect(intent.kind).toBe('JOIN')
  })

  it.each([
    ['impayé d\'abonnement', { subscriptionStatus: 'SUSPENDED' as const }],
    ['résiliation', { subscriptionStatus: 'CANCELED' as const }],
    ['sanction', { suspendedAt: new Date() }],
  ])('suspendue (%s) : l\'adhésion nouvelle est refusée', async (_cas, trainer) => {
    const { community, learner } = await setup(trainer)

    await expect(initiateMembershipPayment(community.id, learner.id, 'STRIPE'))
      .rejects.toThrow('COMMUNITY_CLOSED_TO_NEW_MEMBERS')
    // Rien n'a été encaissé, ni ouvert.
    expect(await prisma.purchase.count({ where: { communityId: community.id } })).toBe(0)
  })

  it('suspendue : la fiche reste lisible mais ne propose plus d\'entrer', async () => {
    const { community } = await setup({ subscriptionStatus: 'SUSPENDED' })

    const page = await getPublicCommunity(community.slug)
    expect(page).not.toBeNull()
    expect(page!.acceptsMembers).toBe(false)
  })

  it('suspendue : elle quitte l\'annuaire et la recherche', async () => {
    await setup({ subscriptionStatus: 'SUSPENDED' })

    expect((await listPublicCommunities()).items).toHaveLength(0)
    expect((await searchEverything('couture')).communities).toHaveLength(0)
  })

  it('suspendue : un membre en impayé règle toujours son mois', async () => {
    const { profile, community, learner } = await setup()
    const join = await initiateMembershipPayment(community.id, learner.id, 'STRIPE')
    await prisma.$transaction(async (tx) => {
      await tx.purchase.update({ where: { id: join.purchaseId }, data: { providerStatus: 'SUCCEEDED' } })
      await activateMembershipForPurchase(tx, join.purchaseId)
    })
    await renewDueMemberships(new Date(Date.now() + 32 * DAY))

    // La formatrice est suspendue après l'adhésion de Paul.
    await prisma.trainerProfile.update({ where: { id: profile.id }, data: { subscriptionStatus: 'SUSPENDED' } })

    const due = await initiateMembershipPayment(community.id, learner.id, 'STRIPE')
    expect(due.kind).toBe('DUE')
  })
})
