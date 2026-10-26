// ==========================================================================
// Modération et mise en avant — campagne du 12 octobre 2026, m7, m8, m17
// ==========================================================================
// m7  — signalements acceptés contre soi-même, contre un identifiant
//       inexistant, ou d'un type incohérent : la file se remplissait de cibles
//       fantômes ;
// m8  — invitation offerte à un administrateur, acceptée et envoyée alors
//       qu'il ne pourra jamais l'utiliser ;
// m17 — formateurs suspendus, sans rien au catalogue, mis en avant.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { createReport } from '@/lib/reports'
import { issueNominativeInvitation } from '@/lib/invitations'
import { trendingTrainers } from '@/lib/trending'

describe('m7, m8, m17', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup() {
    const trainerUser = await prisma.user.create({ data: { email: 'mariam@test.com', role: 'TRAINER' } })
    const trainer = await prisma.trainerProfile.create({ data: { userId: trainerUser.id, approvedAt: new Date() } })
    await prisma.wallet.create({ data: { trainerId: trainer.id, balance: 0 } })
    const community = await prisma.community.create({
      data: { trainerId: trainer.id, name: 'Atelier', slug: 'atelier', priceFcfa: 2500 },
    })
    const course = await prisma.course.create({
      data: {
        trainerId: trainer.id, slug: 'robe', title: 'Patron de robe', blurb: 'Accroche', description: 'Description',
        category: 'Couture', format: 'pdf', priceFcfa: 5000, status: 'published', publishedAt: new Date(),
      },
    })
    const learner = await prisma.user.create({ data: { email: 'paul@test.com', role: 'LEARNER' } })
    return { trainerUser, trainer, community, course, learner }
  }

  it('m7 — on ne se signale pas soi-même, ni une cible qui n\'existe pas', async () => {
    const { trainerUser, course, learner } = await setup()

    await expect(createReport(trainerUser.id, { targetType: 'COURSE', targetId: course.id, reason: 'SPAM' }))
      .rejects.toThrow('CANNOT_REPORT_SELF')
    await expect(createReport(learner.id, { targetType: 'USER', targetId: learner.id, reason: 'SPAM' }))
      .rejects.toThrow('CANNOT_REPORT_SELF')
    await expect(createReport(learner.id, { targetType: 'COURSE', targetId: crypto.randomUUID(), reason: 'SPAM' }))
      .rejects.toThrow('REPORT_TARGET_NOT_FOUND')
    // Type incohérent : un identifiant de ressource présenté comme un compte.
    await expect(createReport(learner.id, { targetType: 'USER', targetId: course.id, reason: 'SPAM' }))
      .rejects.toThrow('REPORT_TARGET_NOT_FOUND')
    expect(await prisma.report.count()).toBe(0)

    // Le signalement légitime passe toujours.
    await createReport(learner.id, { targetType: 'COURSE', targetId: course.id, reason: 'SPAM' })
    expect(await prisma.report.count()).toBe(1)
  })

  it('m8 — une invitation offerte à un administrateur est refusée, sans dire pourquoi', async () => {
    const { trainerUser, community } = await setup()
    await prisma.user.create({ data: { email: 'finances@nkamva.com', role: 'ADMIN', adminRole: 'FINANCES' } })

    await expect(issueNominativeInvitation({
      communityId: community.id, issuerId: trainerUser.id, email: 'finances@nkamva.com', grant: 'GIFT', giftMonths: 1,
    })).rejects.toThrow('INVITEE_NOT_ELIGIBLE')
    expect(await prisma.communityInvitation.count()).toBe(0)
  })

  it('m17 — un formateur suspendu n\'est plus mis en avant', async () => {
    const { trainer } = await setup()
    expect((await trendingTrainers({ limit: 5 })).items.map((t) => t.id)).toContain(trainer.id)

    await prisma.trainerProfile.update({ where: { id: trainer.id }, data: { subscriptionStatus: 'SUSPENDED' } })
    expect((await trendingTrainers({ limit: 5 })).items.map((t) => t.id)).not.toContain(trainer.id)
  })
})
