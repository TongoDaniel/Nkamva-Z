// ==========================================================================
// Lot 5 — Ce que dit une invitation d'elle-même (constat 10, arbitrage 123)
// ==========================================================================
// Le formateur de l'audit décrivait une panne : « j'invite, la personne entre,
// et l'écran affiche toujours *En attente* ». Rien n'était en panne. La
// pastille appliquait un vocabulaire d'usage unique à un lien de parrainage,
// qui n'en a pas : il n'a pas d'état « accepté », il a un **compteur**.
//
// D'où la règle que ce fichier tient : un statut d'invitation, jamais un
// statut de personne. `ACCEPTED` ne concerne qu'un nominatif — sur un lien,
// une acceptation avance le compteur et ne ferme rien tant qu'il reste de la
// place.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  invitationStatus,
  issueShareLink,
  issueNominativeInvitation,
  listCommunityInvitations,
  consumeInvitationForPurchase,
  revokeInvitation,
} from '@/lib/invitations'

const JOUR = 86_400_000

describe('Lot 5 — statut d\'une invitation', () => {
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
        trainerId: trainer.id, name: 'Finance & Foi', slug: 'finance-et-foi',
        priceFcfa: 5000, status: 'active', visibility: 'PUBLIC',
      },
    })
    return { trainerUser, trainer, community }
  }

  /** Un apprenant de plus, pour consommer une place du lien. */
  async function apprenant(n: number) {
    return prisma.user.create({
      data: { email: `membre${n}@test.com`, role: 'LEARNER', fullName: `Membre ${n}` },
    })
  }

  // --- La fonction, sans base ------------------------------------------------

  it('un lien partageable ne devient jamais « acceptée », même si acceptedAt est posé', () => {
    // Le cas ne se produit pas aujourd'hui — aucun chemin n'écrit `acceptedAt`
    // sur un SHARE_LINK. Le test verrouille la règle pour le jour où un
    // sixième chemin d'acceptation serait ajouté sans y penser.
    const lien = {
      kind: 'SHARE_LINK' as const,
      revokedAt: null,
      acceptedAt: new Date(),
      usesCount: 3,
      maxUses: 25,
      expiresAt: new Date(Date.now() + 30 * JOUR),
    }
    expect(invitationStatus(lien)).toBe('PENDING')
  })

  it('un nominatif accepté est « acceptée »', () => {
    expect(invitationStatus({
      kind: 'NOMINATIVE', revokedAt: null, acceptedAt: new Date(),
      usesCount: 1, maxUses: 1, expiresAt: new Date(Date.now() + 30 * JOUR),
    })).toBe('ACCEPTED')
  })

  it('un lien à son plafond est « épuisée »', () => {
    expect(invitationStatus({
      kind: 'SHARE_LINK', revokedAt: null, acceptedAt: null,
      usesCount: 25, maxUses: 25, expiresAt: new Date(Date.now() + 30 * JOUR),
    })).toBe('EXHAUSTED')
  })

  it('une échéance passée est « expirée », même à moitié utilisée', () => {
    expect(invitationStatus({
      kind: 'SHARE_LINK', revokedAt: null, acceptedAt: null,
      usesCount: 12, maxUses: 25, expiresAt: new Date(Date.now() - JOUR),
    })).toBe('EXPIRED')
  })

  it('la révocation prime sur tout le reste', () => {
    // Révoquer est un acte ; expirer et s'épuiser sont des constats. Ce que le
    // formateur a décidé doit rester lisible dans la liste.
    expect(invitationStatus({
      kind: 'SHARE_LINK', revokedAt: new Date(), acceptedAt: null,
      usesCount: 25, maxUses: 25, expiresAt: new Date(Date.now() - JOUR),
    })).toBe('REVOKED')
  })

  // --- Ce que la liste rend à l'écran ---------------------------------------

  it('un lien utilisé deux fois reste actif, et porte son compteur', async () => {
    const { trainerUser, community } = await setup()
    const { invitation } = await issueShareLink(community.id, trainerUser.id)

    for (const n of [1, 2]) {
      const learner = await apprenant(n)
      await prisma.$transaction((tx) =>
        consumeInvitationForPurchase(tx, invitation.id, learner.id),
      )
    }

    const { items } = await listCommunityInvitations(community.id, trainerUser.id)
    const ligne = items.find((i) => i.id === invitation.id)!

    // C'est exactement ce que la pastille affiche : « 2 / 25 entrés ».
    expect(ligne.status).toBe('PENDING')
    expect(ligne.usesCount).toBe(2)
    expect(ligne.maxUses).toBe(25)
  })

  it('la liste porte de quoi construire la pastille sans requête de plus', async () => {
    const { trainerUser, community } = await setup()
    await issueShareLink(community.id, trainerUser.id)

    const { items } = await listCommunityInvitations(community.id, trainerUser.id)
    // `kind` décide de la forme de la pastille ; sans lui, l'écran retomberait
    // sur le libellé binaire pour tout le monde.
    expect(items[0]).toMatchObject({
      kind: 'SHARE_LINK',
      usesCount: expect.any(Number),
      maxUses: expect.any(Number),
    })
  })

  it('un nominatif consommé bascule bien à « acceptée » dans la liste', async () => {
    const { trainerUser, community } = await setup()
    const { invitation } = await issueNominativeInvitation({
      communityId: community.id,
      issuerId: trainerUser.id,
      email: 'invitee@test.com',
      grant: 'PAID',
    })

    const learner = await apprenant(9)
    await prisma.$transaction((tx) =>
      consumeInvitationForPurchase(tx, invitation.id, learner.id),
    )

    const { items } = await listCommunityInvitations(community.id, trainerUser.id)
    expect(items.find((i) => i.id === invitation.id)!.status).toBe('ACCEPTED')
  })

  it('un lien révoqué sort des actives sans effacer son compteur', async () => {
    const { trainerUser, community } = await setup()
    const { invitation } = await issueShareLink(community.id, trainerUser.id)

    const learner = await apprenant(3)
    await prisma.$transaction((tx) =>
      consumeInvitationForPurchase(tx, invitation.id, learner.id),
    )
    await revokeInvitation(invitation.id, trainerUser.id)

    const { items } = await listCommunityInvitations(community.id, trainerUser.id)
    const ligne = items.find((i) => i.id === invitation.id)!
    expect(ligne.status).toBe('REVOKED')
    // Le compteur survit : il dit combien de personnes sont entrées par ce lien,
    // et ce fait-là ne s'annule pas.
    expect(ligne.usesCount).toBe(1)
  })
})
