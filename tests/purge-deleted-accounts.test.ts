// ==========================================================================
// Job de purge : effacement des comptes après le délai de grâce
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { purgeDeletedAccounts } from '@/lib/jobs/purge-deleted-accounts'
import { SCHEDULED_JOBS, runJob } from '@/lib/jobs'
import { DELETION_GRACE_DAYS } from '@/lib/dto'

const DAY = 86_400_000

describe('Job — purge des comptes supprimés', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function makeLearner(opts: { email: string; requestedDaysAgo?: number | null }) {
    return prisma.user.create({
      data: {
        email: opts.email,
        fullName: 'Aminata Diallo',
        preferredName: 'Aminata',
        phone: '+225 07 00 00 00 00',
        countryCode: 'CI',
        bio: 'Apprenante curieuse.',
        passwordHash: 'hash-factice',
        emailVerifiedAt: new Date(),
        deletionRequestedAt:
          opts.requestedDaysAgo == null ? null : new Date(Date.now() - opts.requestedDaysAgo * DAY),
      },
    })
  }

  /** Formateur + cours publié + achat par `learnerId`, pour vérifier ce qui survit. */
  async function makePurchase(learnerId: string) {
    const trainerUser = await prisma.user.create({ data: { email: `t-${crypto.randomUUID()}@test.com`, role: 'TRAINER' } })
    const trainer = await prisma.trainerProfile.create({ data: { userId: trainerUser.id } })
    const course = await prisma.course.create({
      data: {
        trainerId: trainer.id, slug: `c-${crypto.randomUUID()}`, title: 'Cours',
        blurb: 'Accroche', description: 'Description', category: 'dev', format: 'video',
        priceFcfa: 10000, status: 'published', publishedAt: new Date(), durationSeconds: 3600,
      },
    })
    const purchase = await prisma.purchase.create({
      data: {
        learnerId, trainerId: trainer.id, courseId: course.id,
        amountFcfa: 10000, commissionRate: 0.15, trainerShareFcfa: 8500, platformShareFcfa: 1500,
        provider: 'PAWAPAY', providerTransactionId: `cp_${crypto.randomUUID()}`, providerStatus: 'SUCCEEDED',
      },
    })
    await prisma.courseView.create({ data: { courseId: course.id, learnerId, watchedSeconds: 1200 } })
    await prisma.notification.create({
      data: { userId: learnerId, type: 'TEST', title: 'Bonjour Aminata', body: 'Contenu personnel' },
    })
    return { purchase, course }
  }

  it('efface un compte échu sans toucher aux écritures comptables', async () => {
    const user = await makeLearner({ email: 'echu@test.com', requestedDaysAgo: DELETION_GRACE_DAYS + 1 })
    const { purchase } = await makePurchase(user.id)

    const result = await purgeDeletedAccounts()
    expect(result).toMatchObject({ eligible: 1, purged: 1, failed: 0 })

    const after = await prisma.user.findUnique({ where: { id: user.id } })
    expect(after).not.toBeNull()
    expect(after!.deletedAt).not.toBeNull()
    expect(after!.email).toMatch(/^supprime-.+@nkamva\.invalid$/)
    expect(after!.fullName).toBeNull()
    expect(after!.preferredName).toBeNull()
    expect(after!.phone).toBeNull()
    expect(after!.countryCode).toBeNull()
    expect(after!.bio).toBeNull()
    expect(after!.passwordHash).toBeNull()
    expect(after!.emailVerifiedAt).toBeNull()
    // La demande reste, comme trace de la décision de l'utilisateur.
    expect(after!.deletionRequestedAt).not.toBeNull()

    // L'achat survit : sans lui, la comptabilité ne serait plus vérifiable.
    const keptPurchase = await prisma.purchase.findUnique({ where: { id: purchase.id } })
    expect(keptPurchase).not.toBeNull()
    expect(keptPurchase!.amountFcfa).toBe(10000)

    // Les données de comportement et de contenu personnel partent.
    expect(await prisma.courseView.count({ where: { learnerId: user.id } })).toBe(0)
    expect(await prisma.notification.count({ where: { userId: user.id } })).toBe(0)

    const log = await prisma.auditLog.findFirst({ where: { action: 'ACCOUNT_PURGED', targetId: user.id } })
    expect(log).not.toBeNull()
  })

  it('épargne un compte dont le délai de grâce court encore', async () => {
    const user = await makeLearner({ email: 'recent@test.com', requestedDaysAgo: DELETION_GRACE_DAYS - 1 })

    const result = await purgeDeletedAccounts()
    expect(result).toMatchObject({ eligible: 0, purged: 0 })

    const after = await prisma.user.findUnique({ where: { id: user.id } })
    expect(after!.deletedAt).toBeNull()
    expect(after!.email).toBe('recent@test.com')
    expect(after!.fullName).toBe('Aminata Diallo')
  })

  it('ignore un compte sans demande de suppression', async () => {
    const user = await makeLearner({ email: 'actif@test.com', requestedDaysAgo: null })

    const result = await purgeDeletedAccounts()
    expect(result.eligible).toBe(0)
    expect((await prisma.user.findUnique({ where: { id: user.id } }))!.deletedAt).toBeNull()
  })

  it('respecte une annulation faite pendant le délai', async () => {
    const user = await makeLearner({ email: 'annule@test.com', requestedDaysAgo: DELETION_GRACE_DAYS + 5 })
    await prisma.user.update({ where: { id: user.id }, data: { deletionRequestedAt: null } })

    const result = await purgeDeletedAccounts()
    expect(result.eligible).toBe(0)
    expect((await prisma.user.findUnique({ where: { id: user.id } }))!.email).toBe('annule@test.com')
  })

  it('est idempotent : une deuxième exécution ne retrouve rien à faire', async () => {
    const user = await makeLearner({ email: 'deuxfois@test.com', requestedDaysAgo: DELETION_GRACE_DAYS + 2 })

    expect((await purgeDeletedAccounts()).purged).toBe(1)
    const firstEmail = (await prisma.user.findUnique({ where: { id: user.id } }))!.email

    expect(await purgeDeletedAccounts()).toMatchObject({ eligible: 0, purged: 0, failed: 0 })
    // L'adresse anonymisée ne doit pas être régénérée à chaque passage.
    expect((await prisma.user.findUnique({ where: { id: user.id } }))!.email).toBe(firstEmail)
    expect(await prisma.auditLog.count({ where: { action: 'ACCOUNT_PURGED', targetId: user.id } })).toBe(1)
  })

  it('anonymise aussi le profil formateur', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'formateur@test.com', fullName: 'Kwame Mensah', role: 'TRAINER',
        deletionRequestedAt: new Date(Date.now() - (DELETION_GRACE_DAYS + 1) * DAY),
      },
    })
    const trainer = await prisma.trainerProfile.create({
      data: {
        userId: user.id, slogan: 'Le back-end sans mystère',
        description: 'Présentation publique de Kwame.', websiteUrl: 'https://kwame.example',
        domains: ['Développement'], verifiedLegalName: 'Kwame Mensah',
      },
    })

    expect((await purgeDeletedAccounts()).purged).toBe(1)

    const after = await prisma.trainerProfile.findUnique({ where: { id: trainer.id } })
    expect(after!.slogan).toBeNull()
    expect(after!.description).toBeNull()
    expect(after!.websiteUrl).toBeNull()
    expect(after!.verifiedLegalName).toBeNull()
    expect(after!.domains).toEqual([])
  })

  it('journalise son issue quand il passe par l’ordonnanceur', async () => {
    await makeLearner({ email: 'planifie@test.com', requestedDaysAgo: DELETION_GRACE_DAYS + 1 })
    const job = SCHEDULED_JOBS.find((j) => j.name === 'DELETED_ACCOUNT_PURGE')!

    await runJob(job)

    const log = await prisma.auditLog.findFirst({
      where: { action: 'SCHEDULED_JOB_COMPLETED', targetId: 'DELETED_ACCOUNT_PURGE' },
    })
    expect(log).not.toBeNull()
    expect(log!.meta).toMatchObject({ eligible: 1, purged: 1, failed: 0 })
  })

  it('efface plusieurs comptes échus en une passe', async () => {
    await makeLearner({ email: 'a@test.com', requestedDaysAgo: DELETION_GRACE_DAYS + 1 })
    await makeLearner({ email: 'b@test.com', requestedDaysAgo: DELETION_GRACE_DAYS + 10 })
    await makeLearner({ email: 'c@test.com', requestedDaysAgo: 3 })

    const result = await purgeDeletedAccounts()
    expect(result).toMatchObject({ eligible: 2, purged: 2, failed: 0 })
    expect(await prisma.user.count({ where: { deletedAt: null } })).toBe(1)
  })
})
