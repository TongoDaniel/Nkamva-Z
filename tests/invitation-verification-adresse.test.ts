// ==========================================================================
// Une invitation nominative en attente se signale à la vérification de l'adresse
// ==========================================================================
// `notifyPendingInvitationsForNewAccount` existait mais n'était appelée nulle
// part (audit fonctionnel du 27 octobre 2026). Elle l'est désormais par
// /api/auth/verify-otp, à la **première** vérification — pas à l'inscription,
// où l'adresse n'est pas encore prouvée.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { issueOtp } from '@/lib/otp'
import { POST as verifyOtpRoute } from '@/app/api/auth/verify-otp/route'

const DAY = 86_400_000

async function verify(email: string) {
  const code = await issueOtp(email, null, 'EMAIL_VERIFICATION')
  return verifyOtpRoute(new Request('http://localhost/api/auth/verify-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${Math.floor(Math.random() * 200)}` },
    body: JSON.stringify({ email, code }),
  }))
}

async function communityWithInvitations(email: string) {
  const trainerUser = await prisma.user.create({ data: { email: 'formatrice@test.com', role: 'TRAINER', fullName: 'Awa' } })
  const trainer = await prisma.trainerProfile.create({ data: { userId: trainerUser.id, approvedAt: new Date() } })
  const community = await prisma.community.create({
    data: { trainerId: trainer.id, name: 'Atelier couture', slug: 'atelier-couture', priceFcfa: 2500 },
  })
  const base = {
    communityId: community.id, issuerId: trainerUser.id, issuerRole: 'TRAINER' as const,
    kind: 'NOMINATIVE' as const, grant: 'GIFT' as const, giftMonths: 2, email,
  }
  // Une en attente, une révoquée, une expirée : seule la première compte.
  await prisma.communityInvitation.create({ data: { ...base, tokenHash: 'h1', tokenPrefix: 'p1', expiresAt: new Date(Date.now() + 7 * DAY) } })
  await prisma.communityInvitation.create({ data: { ...base, tokenHash: 'h2', tokenPrefix: 'p2', expiresAt: new Date(Date.now() + 7 * DAY), revokedAt: new Date() } })
  // L'expirée vit dans une autre communauté : la base n'admet qu'une invitation
  // vivante par communauté et par adresse.
  const other = await prisma.community.create({
    data: { trainerId: trainer.id, name: 'Atelier broderie', slug: 'atelier-broderie', priceFcfa: 2500 },
  })
  await prisma.communityInvitation.create({ data: { ...base, communityId: other.id, tokenHash: 'h3', tokenPrefix: 'p3', expiresAt: new Date(Date.now() - DAY) } })
}

describe('Invitation en attente, signalée à la vérification de l\'adresse', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  it('la première vérification notifie l\'invitation en attente, une seule fois', async () => {
    const email = 'invitee@test.com'
    await communityWithInvitations(email)
    const user = await prisma.user.create({ data: { email, role: 'LEARNER' } })

    // Le compte existe, l'adresse n'est pas prouvée : rien n'est encore dit.
    expect(await prisma.notification.count({ where: { userId: user.id } })).toBe(0)

    const res = await verify(email)
    expect(res.status).toBe(200)
    const notes = await prisma.notification.findMany({ where: { userId: user.id } })
    expect(notes).toHaveLength(1)
    expect(notes[0].type).toBe('INVITATION_RECEIVED')
    expect(notes[0].title).toContain('Atelier couture')

    // Vérifier à nouveau une adresse déjà vérifiée ne renotifie pas.
    expect((await verify(email)).status).toBe(200)
    expect(await prisma.notification.count({ where: { userId: user.id } })).toBe(1)
  })

  it('sans invitation, la vérification se fait sans notification', async () => {
    const user = await prisma.user.create({ data: { email: 'seul@test.com', role: 'LEARNER' } })
    expect((await verify('seul@test.com')).status).toBe(200)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).not.toBeNull()
    expect(await prisma.notification.count({ where: { userId: user.id } })).toBe(0)
  })
})
