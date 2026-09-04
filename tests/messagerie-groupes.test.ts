// ==========================================================================
// Messagerie unifiée, temps 1 — les groupes (arbitrages 126, 128, 129, 130)
// ==========================================================================
// Le fil collectif d'une communauté a rejoint la messagerie. Quatre règles
// méritent d'être tenues par des tests, parce qu'elles ne se voient pas en
// lisant un écran :
//
//   · **L'ancien membre lit, sans écrire** (129). C'est le seul changement de
//     droit du chantier, et il aligne le groupe sur ce que l'arbitrage 39
//     accordait déjà au fil privé.
//   · **Le compteur de non-lues passe par le curseur**, pas par
//     `Message.readAt` — qui, dans un groupe, aurait fait marquer le message lu
//     pour tous dès que le premier membre l'ouvre.
//   · **Annoncer est un geste de formateur, dans son groupe seulement** (128).
//     La règle ne peut pas être une contrainte de base : un CHECK ne voit que sa
//     propre ligne.
//   · **L'ordre de la liste** (130) : le groupe qu'on anime, puis ses épingles,
//     puis le dernier message.
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  ensureCommunityGroup,
  listMyConversations,
  getConversation,
  sendMessage,
  markConversationRead,
  setConversationPinned,
  openConversation,
} from '@/lib/messaging'

describe('Messagerie — les groupes', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup() {
    const trainerUser = await prisma.user.create({
      data: { email: 'formatrice@test.com', role: 'TRAINER', fullName: 'Awa Sarr' },
    })
    const trainer = await prisma.trainerProfile.create({
      data: { userId: trainerUser.id, verifiedLegalName: 'Awa Sarr', approvedAt: new Date() },
    })
    const community = await prisma.community.create({
      data: {
        trainerId: trainer.id, name: 'Finance & Foi', slug: 'finance-et-foi', priceFcfa: 5000,
      },
    })
    const member = await prisma.user.create({
      data: { email: 'membre@test.com', role: 'LEARNER', fullName: "Koffi N'Da" },
    })
    const autre = await prisma.user.create({
      data: { email: 'autre@test.com', role: 'LEARNER', fullName: 'Fatou Ba' },
    })
    return { trainerUser, trainer, community, member, autre }
  }

  async function subscribe(communityId: string, learnerId: string, status = 'ACTIVE') {
    return prisma.communitySubscription.create({
      data: {
        communityId, learnerId, status: status as never,
        periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    })
  }

  // --- Création ------------------------------------------------------------

  it('crée le groupe une seule fois, même appelé en parallèle', async () => {
    const { community } = await setup()
    const [a, b, c] = await Promise.all([
      ensureCommunityGroup(community.id),
      ensureCommunityGroup(community.id),
      ensureCommunityGroup(community.id),
    ])
    expect(a.id).toBe(b.id)
    expect(b.id).toBe(c.id)
    const count = await prisma.conversation.count({ where: { communityId: community.id, kind: 'GROUP' } })
    expect(count).toBe(1)
  })

  it("un groupe n'a personne en face", async () => {
    const { community, trainerUser, trainer } = await setup()
    const group = await ensureCommunityGroup(community.id)
    const thread = await getConversation(group.id, trainerUser.id, trainer.id)
    expect(thread.kind).toBe('GROUP')
    expect(thread.peer).toBeNull()
    // Le titre porte le nom de la communauté : c'est lui que la liste affiche.
    expect(thread.title).toBe('Finance & Foi')
  })

  // --- Qui lit, qui écrit --------------------------------------------------

  it('un membre à jour lit et écrit', async () => {
    const { community, member } = await setup()
    await subscribe(community.id, member.id)
    const group = await ensureCommunityGroup(community.id)

    const thread = await getConversation(group.id, member.id, null)
    expect(thread.canWrite).toBe(true)
    await expect(sendMessage(group.id, member.id, null, { body: 'Bonjour à tous' })).resolves.toBeTruthy()
  })

  it('un ancien membre lit le groupe, sans y écrire (arbitrage 129)', async () => {
    const { community, member } = await setup()
    const sub = await subscribe(community.id, member.id)
    const group = await ensureCommunityGroup(community.id)
    await sendMessage(group.id, member.id, null, { body: 'Avant mon départ' })

    // L'adhésion se termine.
    await prisma.communitySubscription.update({
      where: { id: sub.id }, data: { status: 'EXPIRED' },
    })

    const thread = await getConversation(group.id, member.id, null)
    expect(thread.messages).toHaveLength(1)
    expect(thread.canWrite).toBe(false)
    expect(thread.readOnlyReason).toBe('MEMBERSHIP_ENDED')
    await expect(sendMessage(group.id, member.id, null, { body: 'Encore un mot' }))
      .rejects.toThrow('MEMBERSHIP_ENDED')
  })

  it("quelqu'un qui n'en a jamais été ne voit rien", async () => {
    const { community, autre } = await setup()
    const group = await ensureCommunityGroup(community.id)
    await expect(getConversation(group.id, autre.id, null)).rejects.toThrow('CONVERSATION_NOT_FOUND')
  })

  it('un membre banni lit sans écrire, le formateur garde la parole', async () => {
    const { community, member, trainerUser, trainer } = await setup()
    await subscribe(community.id, member.id, 'BANNED')
    const group = await ensureCommunityGroup(community.id)

    const vuDuMembre = await getConversation(group.id, member.id, null)
    expect(vuDuMembre.canWrite).toBe(false)
    expect(vuDuMembre.readOnlyReason).toBe('MEMBER_BANNED')

    const vuDuFormateur = await getConversation(group.id, trainerUser.id, trainer.id)
    expect(vuDuFormateur.canWrite).toBe(true)
  })

  it('le groupe et les messages directs ont chacun leur interrupteur', async () => {
    const { community, member } = await setup()
    await subscribe(community.id, member.id)
    const group = await ensureCommunityGroup(community.id)

    // Fermer le groupe ne ferme pas les messages directs.
    await prisma.community.update({ where: { id: community.id }, data: { forumEnabled: false } })
    const vu = await getConversation(group.id, member.id, null)
    expect(vu.canWrite).toBe(false)
    expect(vu.readOnlyReason).toBe('MESSAGING_DISABLED')
    await expect(openConversation(community.slug, member.id)).resolves.toBeTruthy()
  })

  // --- Compteur de non-lues ------------------------------------------------

  it('le compteur suit le curseur du lecteur, pas un drapeau partagé', async () => {
    const { community, member, autre, trainerUser, trainer } = await setup()
    await subscribe(community.id, member.id)
    await subscribe(community.id, autre.id)
    const group = await ensureCommunityGroup(community.id)

    await sendMessage(group.id, trainerUser.id, trainer.id, { body: 'Un' })
    await sendMessage(group.id, trainerUser.id, trainer.id, { body: 'Deux' })

    const avantMembre = await listMyConversations(member.id, null)
    const avantAutre = await listMyConversations(autre.id, null)
    expect(avantMembre[0].unreadCount).toBe(2)
    expect(avantAutre[0].unreadCount).toBe(2)

    // Le premier lit. Le second ne doit pas en être affecté — c'est exactement
    // ce que `Message.readAt` aurait cassé.
    await markConversationRead(group.id, member.id, null)

    const apresMembre = await listMyConversations(member.id, null)
    const apresAutre = await listMyConversations(autre.id, null)
    expect(apresMembre[0].unreadCount).toBe(0)
    expect(apresAutre[0].unreadCount).toBe(2)
  })

  it('ses propres messages ne se comptent jamais comme non lus', async () => {
    const { community, member } = await setup()
    await subscribe(community.id, member.id)
    const group = await ensureCommunityGroup(community.id)
    await sendMessage(group.id, member.id, null, { body: 'Moi-même' })

    const list = await listMyConversations(member.id, null)
    expect(list[0].unreadCount).toBe(0)
  })

  // --- Annonces ------------------------------------------------------------

  it('le formateur annonce dans son groupe', async () => {
    const { community, trainerUser, trainer, member } = await setup()
    await subscribe(community.id, member.id)
    const group = await ensureCommunityGroup(community.id)

    await sendMessage(group.id, trainerUser.id, trainer.id, {
      body: 'Séance jeudi à 18 h', announcement: true,
    })

    const thread = await getConversation(group.id, member.id, null)
    expect(thread.messages[0].announcement).toBe(true)

    // L'annonce prévient tous les membres — c'est sa raison d'être (F12.9).
    const notifs = await prisma.notification.findMany({ where: { userId: member.id } })
    expect(notifs.map((n) => n.type)).toContain('COMMUNITY_ANNOUNCEMENT')
  })

  it("un membre n'annonce pas", async () => {
    const { community, member } = await setup()
    await subscribe(community.id, member.id)
    const group = await ensureCommunityGroup(community.id)
    await expect(
      sendMessage(group.id, member.id, null, { body: 'Écoutez-moi', announcement: true }),
    ).rejects.toThrow('ANNOUNCEMENT_NOT_ALLOWED')
  })

  it("on n'annonce rien dans un fil privé", async () => {
    const { community, member, trainerUser, trainer } = await setup()
    await subscribe(community.id, member.id)
    const { id } = await openConversation(community.slug, member.id)
    await expect(
      sendMessage(id, trainerUser.id, trainer.id, { body: 'Annonce', announcement: true }),
    ).rejects.toThrow('ANNOUNCEMENT_NOT_ALLOWED')
  })

  it('un message ordinaire de groupe ne prévient personne', async () => {
    const { community, trainerUser, trainer, member } = await setup()
    await subscribe(community.id, member.id)
    const group = await ensureCommunityGroup(community.id)

    await sendMessage(group.id, trainerUser.id, trainer.id, { body: 'Bonjour tout le monde' })

    // Prévenir deux cents personnes à chaque phrase noierait le canal : c'est le
    // compteur de non-lues qui porte le signal.
    const notifs = await prisma.notification.findMany({ where: { userId: member.id } })
    expect(notifs).toHaveLength(0)
  })

  // --- La liste ------------------------------------------------------------

  it('le formateur voit son groupe en tête, et son épingle ne se retire pas', async () => {
    const { community, trainerUser, trainer, member } = await setup()
    await subscribe(community.id, member.id)
    const group = await ensureCommunityGroup(community.id)
    const direct = await openConversation(community.slug, member.id)
    // Le fil privé est le plus récent : sans l'épingle système, il passerait devant.
    await sendMessage(direct.id, member.id, null, { body: 'Une question' })

    const list = await listMyConversations(trainerUser.id, trainer.id)
    expect(list[0].id).toBe(group.id)
    expect(list[0].pinnedBySystem).toBe(true)
    await expect(setConversationPinned(group.id, trainerUser.id, trainer.id, false))
      .rejects.toThrow('PIN_IS_SYSTEM')
  })

  it("une épingle personnelle remonte la conversation", async () => {
    const { community, member, trainerUser, trainer } = await setup()
    await subscribe(community.id, member.id)
    const group = await ensureCommunityGroup(community.id)
    const direct = await openConversation(community.slug, member.id)

    await sendMessage(group.id, trainerUser.id, trainer.id, { body: 'Dans le groupe' })
    await sendMessage(direct.id, member.id, null, { body: 'En privé' })

    // Sans épingle, le plus récent d'abord.
    const avant = await listMyConversations(member.id, null)
    expect(avant[0].id).toBe(direct.id)

    await setConversationPinned(group.id, member.id, null, true)
    const apres = await listMyConversations(member.id, null)
    expect(apres[0].id).toBe(group.id)
    expect(apres[0].pinned).toBe(true)
    expect(apres[0].pinnedBySystem).toBe(false)
  })

  it('le filtre « Groupes » ne rend que les groupes', async () => {
    const { community, member } = await setup()
    await subscribe(community.id, member.id)
    const group = await ensureCommunityGroup(community.id)
    await openConversation(community.slug, member.id)

    const groupes = await listMyConversations(member.id, null, { filter: 'groups' })
    expect(groupes.map((c) => c.id)).toEqual([group.id])
  })

  it('le filtre « Non lues » ne rend que ce qui attend', async () => {
    const { community, member, trainerUser, trainer } = await setup()
    await subscribe(community.id, member.id)
    const group = await ensureCommunityGroup(community.id)
    await sendMessage(group.id, trainerUser.id, trainer.id, { body: 'À lire' })

    expect((await listMyConversations(member.id, null, { filter: 'unread' }))).toHaveLength(1)
    await markConversationRead(group.id, member.id, null)
    expect((await listMyConversations(member.id, null, { filter: 'unread' }))).toHaveLength(0)
  })

  it('la recherche trouve un mot dit dans un message, pas seulement un titre', async () => {
    const { community, member, trainerUser, trainer } = await setup()
    await subscribe(community.id, member.id)
    const group = await ensureCommunityGroup(community.id)
    await sendMessage(group.id, trainerUser.id, trainer.id, { body: 'Rendez-vous à Douala' })

    // Le mot n'est ni dans le nom du groupe, ni dans celui de personne.
    const parMessage = await listMyConversations(member.id, null, { search: 'douala' })
    expect(parMessage.map((c) => c.id)).toEqual([group.id])

    // Et le titre reste cherchable.
    const parTitre = await listMyConversations(member.id, null, { search: 'finance' })
    expect(parTitre.map((c) => c.id)).toContain(group.id)

    const rien = await listMyConversations(member.id, null, { search: 'introuvable' })
    expect(rien).toHaveLength(0)
  })
})
