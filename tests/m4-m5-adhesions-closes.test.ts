// ==========================================================================
// Adhésions qui ne se ferment pas comme elles le devraient
// Campagne du 12 octobre 2026, M4 et M5
// ==========================================================================
// M4 — Le renouvellement ferme une adhésion bannie en `EXPIRED`, et rien ne
//      regardait les bannissements passés : Bintou, bannie, est passée `EXPIRED`
//      à la première nuit, puis a réadhéré et payé dans la minute.
// M5 — Un membre qui supprime son compte gardait une adhésion `ACTIVE` pour
//      toujours : « 1 membres » sur la fiche, un membre sans nom chez la
//      formatrice, et un obstacle si elle voulait fermer son propre compte.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { initiateMembershipPayment, activateMembershipForPurchase, renewDueMemberships } from '@/lib/memberships'
import { banCommunityMember, unbanCommunityMember } from '@/lib/communities'
import { purgeDeletedAccounts } from '@/lib/jobs/purge-deleted-accounts'
import { DELETION_GRACE_DAYS } from '@/lib/dto'

const DAY = 86_400_000

describe('M4 et M5 — adhésions closes', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup() {
    const trainerUser = await prisma.user.create({ data: { email: 'awa@test.com', role: 'TRAINER', fullName: 'Awa' } })
    const trainer = await prisma.trainerProfile.create({ data: { userId: trainerUser.id, approvedAt: new Date() } })
    await prisma.wallet.create({ data: { trainerId: trainer.id, balance: 0 } })
    const community = await prisma.community.create({
      data: { trainerId: trainer.id, name: 'Atelier Montage', slug: 'atelier-montage', priceFcfa: 2500 },
    })
    const learner = await prisma.user.create({ data: { email: 'bintou@test.com', role: 'LEARNER', fullName: 'Bintou' } })
    return { trainerUser, trainer, community, learner }
  }

  async function join(communityId: string, learnerId: string) {
    const intent = await initiateMembershipPayment(communityId, learnerId, 'STRIPE')
    await prisma.$transaction(async (tx) => {
      await tx.purchase.update({ where: { id: intent.purchaseId }, data: { providerStatus: 'SUCCEEDED' } })
      await activateMembershipForPurchase(tx, intent.purchaseId)
    })
  }

  // --- M4 ---

  it('un banni dont la période s\'est close ne réadhère pas', async () => {
    const { trainerUser, trainer, community, learner } = await setup()
    await join(community.id, learner.id)
    await banCommunityMember(community.id, learner.id, trainer.id, trainerUser.id, 'Messages insultants répétés')

    await renewDueMemberships(new Date(Date.now() + 32 * DAY))
    const closed = await prisma.communitySubscription.findFirstOrThrow({ where: { learnerId: learner.id } })
    expect(closed.status).toBe('EXPIRED')

    await expect(initiateMembershipPayment(community.id, learner.id, 'STRIPE')).rejects.toThrow('MEMBERSHIP_BANNED')
  })

  it('le formateur peut lever la sanction après la fin de la période, et la porte se rouvre', async () => {
    const { trainerUser, trainer, community, learner } = await setup()
    await join(community.id, learner.id)
    await banCommunityMember(community.id, learner.id, trainer.id, trainerUser.id, 'Messages insultants répétés')
    await renewDueMemberships(new Date(Date.now() + 32 * DAY))

    const { status } = await unbanCommunityMember(community.id, learner.id, trainer.id, trainerUser.id)
    // L'adhésion close le reste : on n'efface que la sanction.
    expect(status).toBe('EXPIRED')

    const intent = await initiateMembershipPayment(community.id, learner.id, 'STRIPE')
    expect(intent.kind).toBe('JOIN')
  })

  // --- M5 ---

  it('la purge d\'un compte ferme ses adhésions et annule ses échéances', async () => {
    const { community, learner } = await setup()
    await join(community.id, learner.id)
    await renewDueMemberships(new Date(Date.now() + 32 * DAY))
    expect(await prisma.purchase.count({ where: { learnerId: learner.id, providerStatus: 'PENDING' } })).toBe(1)

    await prisma.user.update({
      where: { id: learner.id },
      data: { deletionRequestedAt: new Date(Date.now() - (DELETION_GRACE_DAYS + 1) * DAY) },
    })
    await purgeDeletedAccounts()

    const sub = await prisma.communitySubscription.findFirstOrThrow({ where: { learnerId: learner.id } })
    expect(sub.status).toBe('CANCELED')
    expect(sub.canceledAt).not.toBeNull()
    expect(await prisma.purchase.count({ where: { learnerId: learner.id, providerStatus: 'PENDING' } })).toBe(0)
    // Le compteur public ne compte plus personne.
    expect((await prisma.community.findUniqueOrThrow({ where: { id: community.id } })).membersCount).toBe(0)
  })
})
