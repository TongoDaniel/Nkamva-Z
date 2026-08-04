// ==========================================================================
// Espace membre — annonces, fil de discussion, et la frontière lire / parler
// ==========================================================================
// Ces tests portent moins sur les messages que sur les gardes. Trois arbitrages
// (40, 63, 68) disent la même chose sous trois angles : la lecture et la parole
// ne se retirent pas ensemble. Les confondre ferait taire des gens qu'on
// voulait seulement laisser entrer.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  getCommunitySpace, createPost, replyToPost, deletePost, deleteReply,
  togglePinned, refreshCommunityActivity,
} from '@/lib/community-space'

describe('Espace membre d\'une communauté', () => {
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
      data: { email: 'membre@test.com', role: 'LEARNER', fullName: 'Koffi N\'Da' },
    })
    const outsider = await prisma.user.create({
      data: { email: 'passant@test.com', role: 'LEARNER', fullName: 'Sara Diop' },
    })
    return { trainerUser, trainer, community, member, outsider }
  }

  function subscribe(communityId: string, learnerId: string, status: 'ACTIVE' | 'PAST_DUE' | 'BANNED' = 'ACTIVE') {
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

  it('l\'espace est fermé à qui n\'est pas membre, ouvert à l\'animateur', async () => {
    const { community, member, outsider, trainerUser } = await setup()

    await expect(getCommunitySpace(community.slug, outsider.id)).rejects.toThrow('NOT_MEMBER')

    // Le formateur n'adhère pas à sa propre communauté : il y entre quand même.
    const asTrainer = await getCommunitySpace(community.slug, trainerUser.id)
    expect(asTrainer.isTrainer).toBe(true)

    await subscribe(community.id, member.id)
    expect((await getCommunitySpace(community.slug, member.id)).isTrainer).toBe(false)
  })

  it('un compte exclu n\'entre nulle part', async () => {
    const { community, member } = await setup()
    await subscribe(community.id, member.id)
    await prisma.user.update({ where: { id: member.id }, data: { sanctionLevel: 'BANNED' } })

    await expect(getCommunitySpace(community.slug, member.id)).rejects.toThrow('ACCOUNT_BANNED')
  })

  it('l\'impayé ne coupe pas la parole pendant le sursis', async () => {
    const { community, member } = await setup()
    await subscribe(community.id, member.id, 'PAST_DUE')

    const space = await getCommunitySpace(community.slug, member.id)
    expect(space.canSpeak).toBe(true)
    await expect(createPost(community.slug, member.id, { kind: 'DISCUSSION', body: 'Bonjour' }))
      .resolves.toBeTruthy()
  })

  // --- Écrire ---

  it('le membre lance une discussion, le formateur une annonce', async () => {
    const { community, member, trainerUser } = await setup()
    await subscribe(community.id, member.id)

    await createPost(community.slug, member.id, { kind: 'DISCUSSION', body: 'Une question' })
    await createPost(community.slug, trainerUser.id, { kind: 'ANNOUNCEMENT', body: 'Un rendez-vous' })

    const space = await getCommunitySpace(community.slug, member.id)
    expect(space.discussions.map((p) => p.body)).toEqual(['Une question'])
    expect(space.announcements.map((p) => p.body)).toEqual(['Un rendez-vous'])
    expect(space.announcements[0].author.isTrainer).toBe(true)
    expect(space.discussions[0].author.isTrainer).toBe(false)
  })

  it('un membre ne peut pas emprunter la voix de l\'animateur', async () => {
    const { community, member } = await setup()
    await subscribe(community.id, member.id)

    await expect(
      createPost(community.slug, member.id, { kind: 'ANNOUNCEMENT', body: 'Écoutez-moi' }),
    ).rejects.toThrow('ANNOUNCEMENT_FORBIDDEN')
  })

  it('un salon fermé n\'accepte rien', async () => {
    const { community, member, trainerUser } = await setup({ forumEnabled: false, broadcastEnabled: false })
    await subscribe(community.id, member.id)

    await expect(createPost(community.slug, member.id, { kind: 'DISCUSSION', body: 'Bonjour' }))
      .rejects.toThrow('SALON_DISABLED')
    await expect(createPost(community.slug, trainerUser.id, { kind: 'ANNOUNCEMENT', body: 'Bonjour' }))
      .rejects.toThrow('SALON_DISABLED')
  })

  it('on répond sous une annonce même forum fermé', async () => {
    const { community, member, trainerUser } = await setup({ forumEnabled: false })
    await subscribe(community.id, member.id)
    const post = await createPost(community.slug, trainerUser.id, {
      kind: 'ANNOUNCEMENT', body: 'Session jeudi',
    })

    // Le salon désactivé est celui des discussions entre membres, pas le droit
    // de réagir à l'animateur.
    await expect(replyToPost(community.slug, post.id, member.id, { body: 'Je serai là' }))
      .resolves.toBeTruthy()
  })

  it('un message vide ou trop long est refusé', async () => {
    const { community, member } = await setup()
    await subscribe(community.id, member.id)

    await expect(createPost(community.slug, member.id, { kind: 'DISCUSSION', body: '   ' }))
      .rejects.toThrow('BODY_REQUIRED')
    await expect(createPost(community.slug, member.id, { kind: 'DISCUSSION', body: 'x'.repeat(5001) }))
      .rejects.toThrow('MESSAGE_TOO_LONG')
  })

  // --- Écarter la parole sans retirer l'accès ---

  it('arbitrage 40 — le membre banni lit, mais ne parle plus', async () => {
    const { community, member, trainerUser } = await setup()
    await subscribe(community.id, member.id, 'BANNED')
    await createPost(community.slug, trainerUser.id, { kind: 'ANNOUNCEMENT', body: 'Bienvenue' })

    const space = await getCommunitySpace(community.slug, member.id)
    expect(space.canSpeak).toBe(false)
    expect(space.mutedReason).toBe('BANNED')
    expect(space.announcements).toHaveLength(1)

    await expect(createPost(community.slug, member.id, { kind: 'DISCUSSION', body: 'Coucou' }))
      .rejects.toThrow('MEMBER_BANNED')
  })

  it('arbitrage 63 — un compte restreint lit, mais ne parle plus', async () => {
    const { community, member } = await setup()
    await subscribe(community.id, member.id)
    await prisma.user.update({ where: { id: member.id }, data: { sanctionLevel: 'RESTRICTED' } })

    const space = await getCommunitySpace(community.slug, member.id)
    expect(space.canSpeak).toBe(false)
    expect(space.mutedReason).toBe('RESTRICTED')

    await expect(createPost(community.slug, member.id, { kind: 'DISCUSSION', body: 'Coucou' }))
      .rejects.toThrow('ACCOUNT_RESTRICTED')
  })

  it('un membre banni n\'est pas notifié des annonces', async () => {
    const { community, member, outsider, trainerUser } = await setup()
    await subscribe(community.id, member.id)
    await subscribe(community.id, outsider.id, 'BANNED')

    await createPost(community.slug, trainerUser.id, { kind: 'ANNOUNCEMENT', body: 'Session jeudi' })

    expect(await prisma.notification.count({ where: { userId: member.id } })).toBe(1)
    expect(await prisma.notification.count({ where: { userId: outsider.id } })).toBe(0)
    // L'auteur ne s'annonce rien à lui-même.
    expect(await prisma.notification.count({ where: { userId: trainerUser.id } })).toBe(0)
  })

  it('une discussion ne réveille personne', async () => {
    const { community, member, outsider } = await setup()
    await subscribe(community.id, member.id)
    await subscribe(community.id, outsider.id)

    await createPost(community.slug, member.id, { kind: 'DISCUSSION', body: 'Une question' })
    expect(await prisma.notification.count()).toBe(0)
  })

  // --- Répondre ---

  it('la réponse compte, et remonte la discussion', async () => {
    const { community, member, trainerUser } = await setup()
    await subscribe(community.id, member.id)
    const post = await createPost(community.slug, member.id, { kind: 'DISCUSSION', body: 'Question' })

    await replyToPost(community.slug, post.id, trainerUser.id, { body: 'Réponse' })

    const stored = await prisma.communityPost.findUniqueOrThrow({ where: { id: post.id } })
    expect(stored.repliesCount).toBe(1)
    expect(stored.lastReplyAt).not.toBeNull()

    const space = await getCommunitySpace(community.slug, member.id)
    expect(space.discussions[0].replies.map((r) => r.body)).toEqual(['Réponse'])
    expect(space.discussions[0].replies[0].author.isTrainer).toBe(true)
  })

  // --- Retirer ---

  it('l\'auteur retire le sien, le formateur retire n\'importe lequel', async () => {
    const { community, member, outsider, trainerUser } = await setup()
    await subscribe(community.id, member.id)
    await subscribe(community.id, outsider.id)

    const mine = await createPost(community.slug, member.id, { kind: 'DISCUSSION', body: 'À moi' })
    const theirs = await createPost(community.slug, outsider.id, { kind: 'DISCUSSION', body: 'À eux' })

    await expect(deletePost(community.slug, theirs.id, member.id)).rejects.toThrow('NOT_OWNER')
    await deletePost(community.slug, mine.id, member.id)
    await deletePost(community.slug, theirs.id, trainerUser.id)

    const space = await getCommunitySpace(community.slug, member.id)
    expect(space.discussions).toHaveLength(2)
    // Le fil garde sa structure ; le texte, lui, ne repasse pas au client.
    expect(space.discussions.every((p) => p.deleted && p.body === null)).toBe(true)
  })

  it('un message retiré ne se prolonge pas', async () => {
    const { community, member } = await setup()
    await subscribe(community.id, member.id)
    const post = await createPost(community.slug, member.id, { kind: 'DISCUSSION', body: 'Question' })
    await deletePost(community.slug, post.id, member.id)

    await expect(replyToPost(community.slug, post.id, member.id, { body: 'Tard' }))
      .rejects.toThrow('POST_DELETED')
    await expect(deletePost(community.slug, post.id, member.id)).rejects.toThrow('POST_DELETED')
  })

  it('retirer une réponse la décompte', async () => {
    const { community, member, trainerUser } = await setup()
    await subscribe(community.id, member.id)
    const post = await createPost(community.slug, member.id, { kind: 'DISCUSSION', body: 'Question' })
    const reply = await replyToPost(community.slug, post.id, member.id, { body: 'À retirer' })

    await deleteReply(community.slug, reply.id, trainerUser.id)

    const stored = await prisma.communityPost.findUniqueOrThrow({ where: { id: post.id } })
    expect(stored.repliesCount).toBe(0)
    const space = await getCommunitySpace(community.slug, member.id)
    expect(space.discussions[0].replies[0].deleted).toBe(true)
    expect(space.discussions[0].replies[0].body).toBeNull()
  })

  // --- Épingler ---

  it('seul l\'animateur épingle, et l\'épinglé passe devant', async () => {
    const { community, member, trainerUser } = await setup()
    await subscribe(community.id, member.id)
    const first = await createPost(community.slug, member.id, { kind: 'DISCUSSION', body: 'Ancien' })
    await createPost(community.slug, member.id, { kind: 'DISCUSSION', body: 'Récent' })

    await expect(togglePinned(community.slug, first.id, member.id)).rejects.toThrow('NOT_OWNER')

    await togglePinned(community.slug, first.id, trainerUser.id)
    const space = await getCommunitySpace(community.slug, member.id)
    expect(space.discussions.map((p) => p.body)).toEqual(['Ancien', 'Récent'])
    expect(space.discussions[0].pinned).toBe(true)
  })

  // --- Statistique publique ---

  it('la moyenne de messages par jour cesse d\'être zéro', async () => {
    const { community, member } = await setup()
    await subscribe(community.id, member.id)
    for (let i = 0; i < 14; i += 1) {
      await createPost(community.slug, member.id, { kind: 'DISCUSSION', body: `Message ${i}` })
    }

    expect((await refreshCommunityActivity()).updated).toBe(1)
    expect(
      (await prisma.community.findUniqueOrThrow({ where: { id: community.id } })).messagesPerDay,
    ).toBe(2)

    // Rejouer sans nouveau message ne réécrit rien.
    expect((await refreshCommunityActivity()).updated).toBe(0)
  })
})
