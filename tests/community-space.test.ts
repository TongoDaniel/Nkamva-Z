// ==========================================================================
// Espace membre — la frontière lire / entrer
// ==========================================================================
// Ces tests portaient sur le forum. Il a rejoint la messagerie (arbitrage 126),
// et ce qui s'y écrit se vérifie désormais dans `messagerie-groupes.test.ts`.
//
// Reste ce que cet espace décide encore, et qui n'a pas bougé : **qui entre**.
// Trois arbitrages (40, 63, 68) disent la même chose sous trois angles — la
// lecture et la parole ne se retirent pas ensemble — et les confondre ferait
// taire des gens qu'on voulait seulement laisser entrer.
//
// À noter : cet espace-ci se ferme à qui n'est plus membre, là où le **groupe**
// lui reste lisible (arbitrage 129). Ce n'est pas une incohérence : on garde
// l'accès à ce qui s'est dit, pas à ce qui est inclus.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { getCommunitySpace, refreshCommunityActivity } from '@/lib/community-space'
import { ensureCommunityGroup, sendMessage } from '@/lib/messaging'

describe("Espace membre d'une communauté", () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup(communityOverrides: Record<string, unknown> = {}) {
    const trainerUser = await prisma.user.create({
      data: { email: 'formateur@test.com', role: 'TRAINER', fullName: 'Awa Sarr' },
    })
    const trainer = await prisma.trainerProfile.create({
      data: { userId: trainerUser.id, approvedAt: new Date() },
    })
    const community = await prisma.community.create({
      data: {
        trainerId: trainer.id, name: 'Les artisans du back', slug: 'artisans-back',
        priceFcfa: 5000, ...communityOverrides,
      },
    })
    const member = await prisma.user.create({
      data: { email: 'membre@test.com', role: 'LEARNER', fullName: "Koffi N'Da" },
    })
    const outsider = await prisma.user.create({
      data: { email: 'passant@test.com', role: 'LEARNER', fullName: 'Sara Diop' },
    })
    return { trainerUser, trainer, community, member, outsider }
  }

  function subscribe(
    communityId: string,
    learnerId: string,
    status: 'ACTIVE' | 'PAST_DUE' | 'BANNED' = 'ACTIVE',
  ) {
    return prisma.communitySubscription.create({
      data: {
        communityId, learnerId, status,
        periodStart: new Date(Date.now() - 86_400_000),
        periodEnd: new Date(Date.now() + 30 * 86_400_000),
        provider: 'STRIPE',
        ...(status === 'BANNED' ? { bannedAt: new Date() } : {}),
      },
    })
  }

  // --- Entrer ---

  it("l'espace est fermé à qui n'est pas membre, ouvert à l'animateur", async () => {
    const { community, member, outsider, trainerUser } = await setup()

    await expect(getCommunitySpace(community.slug, outsider.id)).rejects.toThrow('NOT_MEMBER')

    // Le formateur n'adhère pas à sa propre communauté : il y entre quand même.
    const asTrainer = await getCommunitySpace(community.slug, trainerUser.id)
    expect(asTrainer.isTrainer).toBe(true)

    await subscribe(community.id, member.id)
    expect((await getCommunitySpace(community.slug, member.id)).isTrainer).toBe(false)
  })

  it("un compte exclu n'entre nulle part", async () => {
    const { community, member } = await setup()
    await subscribe(community.id, member.id)
    await prisma.user.update({ where: { id: member.id }, data: { sanctionLevel: 'BANNED' } })

    await expect(getCommunitySpace(community.slug, member.id)).rejects.toThrow('ACCOUNT_BANNED')
  })

  it("l'impayé ne coupe pas la parole pendant le sursis", async () => {
    const { community, member } = await setup()
    await subscribe(community.id, member.id, 'PAST_DUE')

    const space = await getCommunitySpace(community.slug, member.id)
    expect(space.canSpeak).toBe(true)
  })

  it('arbitrage 40 — le membre banni entre, sans la parole', async () => {
    const { community, member } = await setup()
    await subscribe(community.id, member.id, 'BANNED')

    const space = await getCommunitySpace(community.slug, member.id)
    expect(space.canSpeak).toBe(false)
    expect(space.mutedReason).toBe('BANNED')
  })

  it('arbitrage 63 — un compte restreint entre, sans la parole', async () => {
    const { community, member } = await setup()
    await subscribe(community.id, member.id)
    await prisma.user.update({ where: { id: member.id }, data: { sanctionLevel: 'RESTRICTED' } })

    const space = await getCommunitySpace(community.slug, member.id)
    expect(space.canSpeak).toBe(false)
    expect(space.mutedReason).toBe('RESTRICTED')
  })

  // --- Ce que la fiche publique annonce ---

  it("la moyenne de messages par jour compte le groupe, pas l'ancien forum", async () => {
    const { community, member } = await setup()
    await subscribe(community.id, member.id)
    const group = await ensureCommunityGroup(community.id)

    for (let i = 0; i < 14; i += 1) {
      await sendMessage(group.id, member.id, null, { body: `Message ${i}` })
    }

    expect((await refreshCommunityActivity()).updated).toBe(1)
    expect(
      (await prisma.community.findUniqueOrThrow({ where: { id: community.id } })).messagesPerDay,
    ).toBe(2)

    // Rejouer sans nouveau message ne réécrit rien.
    expect((await refreshCommunityActivity()).updated).toBe(0)
  })

  it("un fil privé ne gonfle pas l'animation annoncée du salon", async () => {
    const { community, member } = await setup()
    await subscribe(community.id, member.id)
    const { openConversation } = await import('@/lib/messaging')
    const direct = await openConversation(community.slug, member.id)
    for (let i = 0; i < 14; i += 1) {
      await sendMessage(direct.id, member.id, null, { body: `Privé ${i}` })
    }

    await refreshCommunityActivity()
    expect(
      (await prisma.community.findUniqueOrThrow({ where: { id: community.id } })).messagesPerDay,
    ).toBe(0)
  })
})
