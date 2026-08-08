// ==========================================================================
// Messagerie 1 à 1 — arbitrages 33 et 39
// ==========================================================================
// Deux questions, deux arbitrages, et c'est tout ce que ces tests vérifient :
//
//   33 — qui peut écrire à qui ? Celui qui adhère, pas celui qui achète.
//   39 — que devient le fil quand l'adhésion s'arrête ? Il reste lisible.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  openConversation, openConversationWithMember, listMyConversations, getConversation,
  sendMessage, markConversationRead, countUnreadMessages,
} from '@/lib/messaging'
import { initiatePurchase } from '@/lib/purchases'

describe('Messagerie 1 à 1', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup(communityOverrides: Record<string, unknown> = {}) {
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
        priceFcfa: 5000, ...communityOverrides,
      },
    })
    const member = await prisma.user.create({
      data: { email: 'membre@test.com', role: 'LEARNER', fullName: 'Koffi N\'Da' },
    })
    return { trainerUser, trainer, community, member }
  }

  function subscribe(
    communityId: string,
    learnerId: string,
    status: 'ACTIVE' | 'PAST_DUE' | 'BANNED' | 'EXPIRED' = 'ACTIVE',
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

  // --- Arbitrage 33 : le fil vient de l'adhésion, pas de l'achat ---

  it('arbitrage 33 — acheter une ressource n\'ouvre aucun fil', async () => {
    const { community, member, trainer } = await setup()
    await prisma.course.create({
      data: {
        trainerId: trainer.id, slug: 'ddd', title: 'Masterclass DDD', blurb: 'Accroche',
        description: 'Description', category: 'dev', format: 'video', priceFcfa: 15000,
        status: 'published', publishedAt: new Date(),
        contentS3Key: 'course-assets/x/v.mp4', contentMimeType: 'video/mp4',
      },
    })
    const course = await prisma.course.findFirstOrThrow({ where: { slug: 'ddd' } })
    await initiatePurchase(course.id, member.id, 'STRIPE')

    // L'achat a bien eu lieu, et il n'ouvre rien.
    await expect(openConversation(community.slug, member.id)).rejects.toThrow('NOT_MEMBER')
    expect(await listMyConversations(member.id, null)).toHaveLength(0)
  })

  it('l\'adhésion ouvre le fil, et le rouvrir retrouve le même', async () => {
    const { community, member } = await setup()
    await subscribe(community.id, member.id)

    const first = await openConversation(community.slug, member.id)
    const second = await openConversation(community.slug, member.id)

    expect(second.id).toBe(first.id)
    expect(await prisma.conversation.count()).toBe(1)
  })

  it('deux clics simultanés n\'ouvrent qu\'un fil', async () => {
    const { community, member } = await setup()
    await subscribe(community.id, member.id)

    const [a, b] = await Promise.all([
      openConversation(community.slug, member.id),
      openConversation(community.slug, member.id),
    ])
    expect(a.id).toBe(b.id)
    expect(await prisma.conversation.count()).toBe(1)
  })

  it('le formateur n\'ouvre pas de fil avec lui-même', async () => {
    const { community, trainerUser } = await setup()
    await expect(openConversation(community.slug, trainerUser.id)).rejects.toThrow('NOT_MEMBER')
  })

  it('une communauté messagerie fermée n\'ouvre rien', async () => {
    const { community, member } = await setup({ messagingEnabled: false })
    await subscribe(community.id, member.id)
    await expect(openConversation(community.slug, member.id)).rejects.toThrow('MESSAGING_DISABLED')
  })

  // --- Échanger ---

  it('les deux bords écrivent, et se voient', async () => {
    const { community, member, trainerUser, trainer } = await setup()
    await subscribe(community.id, member.id)
    const { id } = await openConversation(community.slug, member.id)

    await sendMessage(id, member.id, null, { body: 'Bonjour, une question.' })
    await sendMessage(id, trainerUser.id, trainer.id, { body: 'Je vous écoute.' })

    const asMember = await getConversation(id, member.id, null)
    expect(asMember.messages.map((m) => m.mine)).toEqual([true, false])
    expect(asMember.peer.fullName).toBe('Awa Sarr')

    const asTrainer = await getConversation(id, trainerUser.id, trainer.id)
    expect(asTrainer.messages.map((m) => m.mine)).toEqual([false, true])
    expect(asTrainer.peer.fullName).toBe('Koffi N\'Da')
  })

  it('un tiers ne lit pas le fil des autres', async () => {
    const { community, member } = await setup()
    await subscribe(community.id, member.id)
    const { id } = await openConversation(community.slug, member.id)
    const stranger = await prisma.user.create({ data: { email: 'tiers@test.com', role: 'LEARNER' } })

    await expect(getConversation(id, stranger.id, null)).rejects.toThrow('CONVERSATION_NOT_FOUND')
    await expect(sendMessage(id, stranger.id, null, { body: 'Coucou' }))
      .rejects.toThrow('CONVERSATION_NOT_FOUND')
  })

  it('un message vide ou trop long est refusé', async () => {
    const { community, member } = await setup()
    await subscribe(community.id, member.id)
    const { id } = await openConversation(community.slug, member.id)

    await expect(sendMessage(id, member.id, null, { body: '  ' })).rejects.toThrow('BODY_REQUIRED')
    await expect(sendMessage(id, member.id, null, { body: 'x'.repeat(5001) }))
      .rejects.toThrow('MESSAGE_TOO_LONG')
  })

  it('le destinataire est notifié, jamais l\'expéditeur', async () => {
    const { community, member, trainerUser } = await setup()
    await subscribe(community.id, member.id)
    const { id } = await openConversation(community.slug, member.id)

    await sendMessage(id, member.id, null, { body: 'Bonjour' })

    expect(await prisma.notification.count({ where: { userId: trainerUser.id, type: 'MESSAGE' } })).toBe(1)
    expect(await prisma.notification.count({ where: { userId: member.id } })).toBe(0)
  })

  // --- Arbitrage 39 : le fil survit à l'adhésion ---

  it('arbitrage 39 — l\'adhésion terminée ferme l\'écriture, pas la lecture', async () => {
    const { community, member, trainerUser, trainer } = await setup()
    const sub = await subscribe(community.id, member.id)
    const { id } = await openConversation(community.slug, member.id)
    await sendMessage(id, member.id, null, { body: 'Avant mon départ' })

    await prisma.communitySubscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED' } })

    const thread = await getConversation(id, member.id, null)
    expect(thread.messages).toHaveLength(1)
    expect(thread.canWrite).toBe(false)
    expect(thread.readOnlyReason).toBe('MEMBERSHIP_ENDED')
    await expect(sendMessage(id, member.id, null, { body: 'Encore un mot' }))
      .rejects.toThrow('MEMBERSHIP_ENDED')

    // Le formateur non plus n'écrit pas à quelqu'un qui a quitté sa communauté.
    await expect(sendMessage(id, trainerUser.id, trainer.id, { body: 'Revenez !' }))
      .rejects.toThrow('MEMBERSHIP_ENDED')
  })

  it('le membre qui revient retrouve son fil, et peut y écrire', async () => {
    const { community, member } = await setup()
    const sub = await subscribe(community.id, member.id)
    const { id } = await openConversation(community.slug, member.id)
    await sendMessage(id, member.id, null, { body: 'Premier passage' })
    await prisma.communitySubscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED' } })

    await subscribe(community.id, member.id)

    const reopened = await openConversation(community.slug, member.id)
    expect(reopened.id).toBe(id)
    const thread = await getConversation(id, member.id, null)
    expect(thread.canWrite).toBe(true)
    expect(thread.messages.map((m) => m.body)).toEqual(['Premier passage'])
  })

  it('l\'impayé n\'interrompt pas la conversation', async () => {
    const { community, member } = await setup()
    await subscribe(community.id, member.id, 'PAST_DUE')
    const { id } = await openConversation(community.slug, member.id)

    expect((await getConversation(id, member.id, null)).canWrite).toBe(true)
    await expect(sendMessage(id, member.id, null, { body: 'Toujours là' })).resolves.toBeTruthy()
  })

  it('arbitrage 40 — le membre banni lit, le formateur garde la parole', async () => {
    const { community, member, trainerUser, trainer } = await setup()
    const sub = await subscribe(community.id, member.id)
    const { id } = await openConversation(community.slug, member.id)
    await prisma.communitySubscription.update({
      where: { id: sub.id }, data: { status: 'BANNED', bannedAt: new Date() },
    })

    const thread = await getConversation(id, member.id, null)
    expect(thread.canWrite).toBe(false)
    expect(thread.readOnlyReason).toBe('MEMBER_BANNED')

    // Bannir quelqu'un puis ne plus pouvoir le lui expliquer serait absurde.
    await expect(sendMessage(id, trainerUser.id, trainer.id, { body: 'Voici pourquoi.' }))
      .resolves.toBeTruthy()
  })

  it('arbitrage 63 — un compte restreint lit, mais n\'écrit plus', async () => {
    const { community, member } = await setup()
    await subscribe(community.id, member.id)
    const { id } = await openConversation(community.slug, member.id)
    await prisma.user.update({ where: { id: member.id }, data: { sanctionLevel: 'RESTRICTED' } })

    expect((await getConversation(id, member.id, null)).readOnlyReason).toBe('ACCOUNT_RESTRICTED')
    await expect(sendMessage(id, member.id, null, { body: 'Coucou' }))
      .rejects.toThrow('ACCOUNT_RESTRICTED')
  })

  // --- Accusés de lecture ---

  it('lire marque ce qu\'on a reçu, pas ce qu\'on a envoyé', async () => {
    const { community, member, trainerUser, trainer } = await setup()
    await subscribe(community.id, member.id)
    const { id } = await openConversation(community.slug, member.id)
    await sendMessage(id, member.id, null, { body: 'Question' })
    await sendMessage(id, trainerUser.id, trainer.id, { body: 'Réponse' })

    expect(await countUnreadMessages(member.id, null)).toBe(1)
    expect(await countUnreadMessages(trainerUser.id, trainer.id)).toBe(1)

    expect((await markConversationRead(id, member.id, null)).read).toBe(1)
    expect(await countUnreadMessages(member.id, null)).toBe(0)
    // Le formateur, lui, n'a rien lu : son propre accusé reste à venir.
    expect(await countUnreadMessages(trainerUser.id, trainer.id)).toBe(1)
  })

  it('la liste rend le dernier message et le compte non lus', async () => {
    const { community, member, trainerUser, trainer } = await setup()
    await subscribe(community.id, member.id)
    const { id } = await openConversation(community.slug, member.id)
    await sendMessage(id, trainerUser.id, trainer.id, { body: 'Bienvenue !' })

    const mine = await listMyConversations(member.id, null)
    expect(mine).toHaveLength(1)
    expect(mine[0].lastMessage).toMatchObject({ body: 'Bienvenue !', mine: false })
    expect(mine[0].unreadCount).toBe(1)
    expect(mine[0].communityName).toBe('Les artisans du back')

    // Le formateur voit le même fil depuis son bord.
    const theirs = await listMyConversations(trainerUser.id, trainer.id)
    expect(theirs.map((c) => c.id)).toEqual([id])
    expect(theirs[0].peer.fullName).toBe('Koffi N\'Da')
  })

  // --- Le formateur aborde aussi ---
  //
  // Une conversation ne naissait que du membre : le formateur répondait, il
  // n'abordait pas. La règle a été levée pour les membres de son propre salon,
  // et ces tests bornent l'ouverture qu'elle laisse.

  it('le formateur ouvre le fil d\'un de ses membres', async () => {
    const { community, member, trainerUser, trainer } = await setup()
    await subscribe(community.id, member.id)

    const { id } = await openConversationWithMember(community.id, member.id, trainerUser.id)
    const theirs = await listMyConversations(trainerUser.id, trainer.id)
    expect(theirs.map((c) => c.id)).toEqual([id])

    // Idempotente des deux bords : le membre retrouve le même fil.
    expect((await openConversation(community.slug, member.id)).id).toBe(id)
  })

  it('arbitrage 40 — il peut écrire à un membre banni, pour s\'en expliquer', async () => {
    const { community, member, trainerUser } = await setup()
    await subscribe(community.id, member.id, 'BANNED')

    await expect(
      openConversationWithMember(community.id, member.id, trainerUser.id),
    ).resolves.toMatchObject({ id: expect.any(String) })
    // Le banni, lui, n'ouvre rien : c'est ce que « couper la parole » veut dire.
    await expect(openConversation(community.slug, member.id)).rejects.toThrow('MEMBER_BANNED')
  })

  it('arbitrage 33 — pas d\'adhésion ouverte, pas de fil, même à son initiative', async () => {
    const { community, member, trainerUser } = await setup()
    await subscribe(community.id, member.id, 'EXPIRED')

    await expect(
      openConversationWithMember(community.id, member.id, trainerUser.id),
    ).rejects.toThrow('NOT_MEMBER')
  })

  it('un salon aux messages fermés n\'ouvre rien, ni d\'un bord ni de l\'autre', async () => {
    const { community, member, trainerUser } = await setup({ messagingEnabled: false })
    await subscribe(community.id, member.id)

    await expect(
      openConversationWithMember(community.id, member.id, trainerUser.id),
    ).rejects.toThrow('MESSAGING_DISABLED')
  })

  it('un formateur n\'ouvre pas le fil d\'une communauté qui n\'est pas la sienne', async () => {
    const { community, member } = await setup()
    await subscribe(community.id, member.id)
    const intrus = await prisma.user.create({
      data: { email: 'intrus@test.com', role: 'TRAINER', fullName: 'Kofi Mensah' },
    })
    await prisma.trainerProfile.create({ data: { userId: intrus.id, approvedAt: new Date() } })

    await expect(
      openConversationWithMember(community.id, member.id, intrus.id),
    ).rejects.toThrow('NOT_OWNER')
  })
})
