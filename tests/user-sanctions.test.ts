// ==========================================================================
// Sanctions de compte — arbitrage 63
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { applySanction, canUserWrite } from '@/lib/user-sanctions'
import { checkCourseAccess } from '@/lib/access'
import { openDispute } from '@/lib/disputes'

describe('Sanctions de compte', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  const MOTIF = 'Comportement répété signalé par plusieurs formateurs.'

  async function setup() {
    const learner = await prisma.user.create({ data: { email: 'apprenant@test.com', role: 'LEARNER' } })
    const superAdmin = await prisma.user.create({
      data: { email: 'super@test.com', role: 'ADMIN', adminRole: 'SUPER_ADMIN' },
    })
    const trainerUser = await prisma.user.create({ data: { email: 'formateur@test.com', role: 'TRAINER' } })
    const trainer = await prisma.trainerProfile.create({
      data: { userId: trainerUser.id, approvedAt: new Date() },
    })
    await prisma.wallet.create({ data: { trainerId: trainer.id, balance: 0 } })
    const course = await prisma.course.create({
      data: {
        trainerId: trainer.id, slug: 'ddd', title: 'DDD', blurb: 'Accroche',
        description: 'Description', category: 'dev', format: 'video', priceFcfa: 15000,
        status: 'published', publishedAt: new Date(),
        contentS3Key: 'course-assets/x/video.mp4', contentMimeType: 'video/mp4',
      },
    })
    const purchase = await prisma.purchase.create({
      data: {
        learnerId: learner.id, trainerId: trainer.id, courseId: course.id,
        amountFcfa: 15000, commissionRate: 0.15, trainerShareFcfa: 12750, platformShareFcfa: 2250,
        provider: 'STRIPE', providerTransactionId: `pi_${crypto.randomUUID()}`, providerStatus: 'SUCCEEDED',
      },
    })
    return { learner, superAdmin, trainer, course, purchase }
  }

  const asSuper = (actorId: string) =>
    ({ reason: MOTIF, actorId, actorAdminRole: 'SUPER_ADMIN' as const })

  it('la restriction écarte la parole sans retirer l\'accès', async () => {
    const { learner, superAdmin, course } = await setup()

    await applySanction(learner.id, { level: 'RESTRICTED', ...asSuper(superAdmin.id) })

    // Ce qui a été payé reste lisible : c'est la différence avec l'exclusion.
    expect((await checkCourseAccess(course.id, learner.id)).granted).toBe(true)
    expect(await canUserWrite(learner.id)).toBe(false)

    // La connexion n'est pas coupée.
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: learner.id } })
    expect(updated.suspendedAt).toBeNull()
    expect(updated.sanctionLevel).toBe('RESTRICTED')
  })

  it('un compte restreint ne peut plus ouvrir de litige', async () => {
    const { learner, superAdmin, purchase } = await setup()
    await applySanction(learner.id, { level: 'RESTRICTED', ...asSuper(superAdmin.id) })

    await expect(
      openDispute(learner.id, { purchaseId: purchase.id, reason: 'OTHER' }),
    ).rejects.toThrow('ACCOUNT_RESTRICTED')
  })

  it('l\'exclusion coupe la connexion ET retire les ressources payées', async () => {
    const { learner, superAdmin, course } = await setup()

    await applySanction(learner.id, { level: 'BANNED', ...asSuper(superAdmin.id) })

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: learner.id } })
    expect(updated.suspendedAt).not.toBeNull()

    const access = await checkCourseAccess(course.id, learner.id)
    expect(access.granted).toBe(false)
    expect(access.reason).toBe('ACCOUNT_BANNED')
  })

  it('l\'exclusion et sa levée sont refusées à la Modération', async () => {
    const { learner, superAdmin } = await setup()
    const moderator = await prisma.user.create({
      data: { email: 'moderation@test.com', role: 'ADMIN', adminRole: 'MODERATION' },
    })

    await expect(
      applySanction(learner.id, {
        level: 'BANNED', reason: MOTIF, actorId: moderator.id, actorAdminRole: 'MODERATION',
      }),
    ).rejects.toThrow('SANCTION_FORBIDDEN')

    // Lever une exclusion pèse autant que la prononcer.
    await applySanction(learner.id, { level: 'BANNED', ...asSuper(superAdmin.id) })
    await expect(
      applySanction(learner.id, {
        level: 'NONE', reason: MOTIF, actorId: moderator.id, actorAdminRole: 'MODERATION',
      }),
    ).rejects.toThrow('SANCTION_FORBIDDEN')
  })

  it('toute sanction invalide les sessions ouvertes et est journalisée', async () => {
    const { learner, superAdmin } = await setup()
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: learner.id } })).sessionsValidAfter

    await applySanction(learner.id, { level: 'RESTRICTED', ...asSuper(superAdmin.id) })

    const after = await prisma.user.findUniqueOrThrow({ where: { id: learner.id } })
    // Sans ce bump, un jeton déjà émis continuerait d'écrire.
    expect(after.sessionsValidAfter.getTime()).toBeGreaterThan(before.getTime())

    const log = await prisma.auditLog.findFirst({
      where: { action: 'USER_SANCTION_CHANGED', targetId: learner.id },
    })
    expect(log!.meta).toMatchObject({ from: 'NONE', to: 'RESTRICTED' })
  })

  it('exige un motif, refuse l\'auto-sanction et le doublon', async () => {
    const { learner, superAdmin } = await setup()

    await expect(
      applySanction(learner.id, { level: 'RESTRICTED', reason: 'court', actorId: superAdmin.id, actorAdminRole: 'SUPER_ADMIN' }),
    ).rejects.toThrow('JUSTIFICATION_REQUIRED')

    await expect(
      applySanction(superAdmin.id, { level: 'RESTRICTED', ...asSuper(superAdmin.id) }),
    ).rejects.toThrow('SANCTION_SELF_FORBIDDEN')

    await applySanction(learner.id, { level: 'RESTRICTED', ...asSuper(superAdmin.id) })
    await expect(
      applySanction(learner.id, { level: 'RESTRICTED', ...asSuper(superAdmin.id) }),
    ).rejects.toThrow('SANCTION_UNCHANGED')
  })

  it('la levée rétablit tout', async () => {
    const { learner, superAdmin, course } = await setup()
    await applySanction(learner.id, { level: 'BANNED', ...asSuper(superAdmin.id) })
    await applySanction(learner.id, { level: 'NONE', ...asSuper(superAdmin.id) })

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: learner.id } })
    expect(updated.sanctionLevel).toBe('NONE')
    expect(updated.suspendedAt).toBeNull()
    expect(updated.sanctionReason).toBeNull()
    expect((await checkCourseAccess(course.id, learner.id)).granted).toBe(true)
    expect(await canUserWrite(learner.id)).toBe(true)
  })
})
