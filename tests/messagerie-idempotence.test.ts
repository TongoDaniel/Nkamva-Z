// ==========================================================================
// Lot 4 — Idempotence de l'envoi et sondage incrémental (§4.2, constat 9)
// ==========================================================================
// Le doublon constaté par l'audit ne venait pas d'un double clic : le bouton se
// désactive pendant l'envoi. Il venait du **délai client de 20 s**, qui annule
// la requête pendant que le serveur, lui, committe. L'écran annonçait alors
// « votre message n'est pas parti », la personne renvoyait, et le fil portait
// deux fois la même phrase.
//
// La clé est tirée par le navigateur à la frappe et rejouée telle quelle à
// chaque tentative du même message. Un identifiant tiré à chaque essai
// n'aurait rien empêché — c'est la **conservation** qui fait le mécanisme, et
// c'est elle que le premier test vérifie.
//
// Le sondage incrémental répond à la question laissée ouverte sur la cadence
// d'un groupe : ce n'est pas la fréquence qui devait changer, c'est la charge.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  ensureCommunityGroup, sendMessage, getConversation, openConversation,
} from '@/lib/messaging'

describe("Lot 4 — idempotence et sondage", () => {
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
      data: { trainerId: trainer.id, name: 'Finance & Foi', slug: 'finance-et-foi', priceFcfa: 5000 },
    })
    const member = await prisma.user.create({
      data: { email: 'membre@test.com', role: 'LEARNER', fullName: "Koffi N'Da" },
    })
    await prisma.communitySubscription.create({
      data: {
        communityId: community.id, learnerId: member.id, status: 'ACTIVE',
        periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    })
    return { trainerUser, trainer, community, member }
  }

  // --- Idempotence ---------------------------------------------------------

  it('la même clé rejouée ne crée pas un second message', async () => {
    const { community, member } = await setup()
    const group = await ensureCommunityGroup(community.id)

    const clientKey = 'cle-de-test-0001'
    const a = await sendMessage(group.id, member.id, null, { body: 'Bonjour', clientKey })
    // Ce que fait l'écran quand le délai client a annulé une requête que le
    // serveur avait pourtant committée : il renvoie, avec la même clé.
    const b = await sendMessage(group.id, member.id, null, { body: 'Bonjour', clientKey })

    expect(b.id).toBe(a.id)
    expect(await prisma.message.count({ where: { conversationId: group.id } })).toBe(1)
  })

  it('deux tentatives simultanées de la même clé ne passent qu\'une fois', async () => {
    const { community, member } = await setup()
    const group = await ensureCommunityGroup(community.id)

    const clientKey = 'cle-de-test-0002'
    // L'index tranche la course ; le perdant rend la ligne du gagnant.
    const [a, b] = await Promise.all([
      sendMessage(group.id, member.id, null, { body: 'Ensemble', clientKey }),
      sendMessage(group.id, member.id, null, { body: 'Ensemble', clientKey }),
    ])

    expect(a.id).toBe(b.id)
    expect(await prisma.message.count({ where: { conversationId: group.id } })).toBe(1)
  })

  it('deux clés différentes restent deux messages', async () => {
    const { community, member } = await setup()
    const group = await ensureCommunityGroup(community.id)

    await sendMessage(group.id, member.id, null, { body: 'Un', clientKey: 'cle-aaaa-0001' })
    await sendMessage(group.id, member.id, null, { body: 'Deux', clientKey: 'cle-bbbb-0002' })

    expect(await prisma.message.count({ where: { conversationId: group.id } })).toBe(2)
  })

  it('sans clé, rien ne change — le même texte deux fois fait deux messages', async () => {
    const { community, member } = await setup()
    const group = await ensureCommunityGroup(community.id)

    // Répéter une phrase est légitime : l'idempotence porte sur la **tentative**,
    // pas sur le texte. Sans clé, on ne peut pas les distinguer, et on n'essaie
    // pas de deviner.
    await sendMessage(group.id, member.id, null, { body: 'Oui' })
    await sendMessage(group.id, member.id, null, { body: 'Oui' })

    expect(await prisma.message.count({ where: { conversationId: group.id } })).toBe(2)
  })

  it("une clé ne vaut que dans sa conversation", async () => {
    const { community, member } = await setup()
    const group = await ensureCommunityGroup(community.id)
    const direct = await openConversation(community.slug, member.id)

    const clientKey = 'cle-partagee-0003'
    await sendMessage(group.id, member.id, null, { body: 'Dans le groupe', clientKey })
    await sendMessage(direct.id, member.id, null, { body: 'En privé', clientKey })

    expect(await prisma.message.count({ where: { conversationId: group.id } })).toBe(1)
    expect(await prisma.message.count({ where: { conversationId: direct.id } })).toBe(1)
  })

  it("une clé rejouée ne renotifie personne", async () => {
    const { community, member, trainerUser, trainer } = await setup()
    const group = await ensureCommunityGroup(community.id)

    const clientKey = 'cle-annonce-0004'
    await sendMessage(group.id, trainerUser.id, trainer.id, {
      body: 'Séance jeudi', announcement: true, clientKey,
    })
    await sendMessage(group.id, trainerUser.id, trainer.id, {
      body: 'Séance jeudi', announcement: true, clientKey,
    })

    // Les effets de bord pendent au chemin d'écriture, pas au retour : le rejeu
    // sort avant de les déclencher.
    const notifs = await prisma.notification.findMany({ where: { userId: member.id } })
    expect(notifs).toHaveLength(1)
  })

  // --- Sondage incrémental -------------------------------------------------

  it('sans repère, le fil est rendu en entier', async () => {
    const { community, member } = await setup()
    const group = await ensureCommunityGroup(community.id)
    await sendMessage(group.id, member.id, null, { body: 'Un' })
    await sendMessage(group.id, member.id, null, { body: 'Deux' })

    const fil = await getConversation(group.id, member.id, null)
    expect(fil.messages).toHaveLength(2)
  })

  it('avec un repère, seuls les messages postés après reviennent', async () => {
    const { community, member, trainerUser, trainer } = await setup()
    const group = await ensureCommunityGroup(community.id)
    await sendMessage(group.id, member.id, null, { body: 'Ancien' })

    const complet = await getConversation(group.id, member.id, null)
    const repere = complet.messages.at(-1)!.createdAt

    await sendMessage(group.id, trainerUser.id, trainer.id, { body: 'Nouveau' })

    const incremental = await getConversation(group.id, member.id, null, repere)
    expect(incremental.messages.map((m) => m.body)).toEqual(['Nouveau'])
  })

  it('le résumé reste frais même quand aucun message ne revient', async () => {
    const { community, member } = await setup()
    const group = await ensureCommunityGroup(community.id)
    await sendMessage(group.id, member.id, null, { body: 'Seul' })

    const complet = await getConversation(group.id, member.id, null)
    const repere = complet.messages.at(-1)!.createdAt

    // Rien de neuf : la charge utile est vide, mais le droit d'écrire et le
    // compteur de non-lues doivent quand même être à jour — c'est ce qui permet
    // à l'écran de fermer la saisie sans recharger la page.
    const incremental = await getConversation(group.id, member.id, null, repere)
    expect(incremental.messages).toHaveLength(0)
    expect(incremental.canWrite).toBe(true)
    expect(incremental.title).toBe('Finance & Foi')
    expect(incremental.kind).toBe('GROUP')
  })

  it('un repère ne contourne pas la garde de lecture', async () => {
    const { community } = await setup()
    const group = await ensureCommunityGroup(community.id)
    const etranger = await prisma.user.create({
      data: { email: 'etranger@test.com', role: 'LEARNER' },
    })

    await expect(getConversation(group.id, etranger.id, null, new Date(0)))
      .rejects.toThrow('CONVERSATION_NOT_FOUND')
  })
})
