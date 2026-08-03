// ==========================================================================
// Signalements (décision 7) et tarification plateforme (décisions 56-62)
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { createReport, resolveReport, getReportDetail, getReportStats } from '@/lib/reports'
import { setTariff, createDiscount, quotePrice, getCurrentTariff } from '@/lib/pricing'

describe('Signalements & tarification', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setup() {
    const learner = await prisma.user.create({ data: { email: 'apprenant@test.com' } })
    const moderator = await prisma.user.create({
      data: { email: 'moderation@test.com', role: 'ADMIN', adminRole: 'MODERATION' },
    })
    const trainerUser = await prisma.user.create({ data: { email: 'formateur@test.com', role: 'TRAINER' } })
    const profile = await prisma.trainerProfile.create({ data: { userId: trainerUser.id } })
    const course = await prisma.course.create({
      data: {
        trainerId: profile.id, slug: 'ressource-test', title: 'Ressource test',
        blurb: 'Accroche', description: 'Description', category: 'Dev', format: 'video',
        priceFcfa: 20_000, status: 'published',
      },
    })
    return { learner, moderator, profile, course }
  }

  // -------------------------------------------------------------------------
  it('retenir un signalement retire la ressource du catalogue', async () => {
    const { learner, moderator, course } = await setup()

    const report = await createReport(learner.id, {
      targetType: 'COURSE', targetId: course.id, reason: 'INTELLECTUAL_PROPERTY',
    })
    expect(report.status).toBe('OPEN')

    const fresh = await prisma.report.findUniqueOrThrow({ where: { id: report.id } })
    await resolveReport(report.id, {
      status: 'UPHELD',
      decisionNote: 'Contenu protégé repris sans autorisation.',
      hideTarget: true,
      actorId: moderator.id, actorRole: 'MODERATION',
      expectedUpdatedAt: fresh.updatedAt.toISOString(),
    })

    const hidden = await prisma.course.findUniqueOrThrow({ where: { id: course.id } })
    expect(hidden.status).toBe('archived')

    // L'auteur du signalement est prévenu, avec la motivation telle quelle.
    const notification = await prisma.notification.findFirst({ where: { userId: learner.id } })
    expect(notification?.body).toContain('Contenu protégé')
  })

  it('rejeter un signalement ne touche pas la ressource', async () => {
    const { learner, moderator, course } = await setup()
    const report = await createReport(learner.id, {
      targetType: 'COURSE', targetId: course.id, reason: 'SPAM',
    })
    const fresh = await prisma.report.findUniqueOrThrow({ where: { id: report.id } })

    await resolveReport(report.id, {
      status: 'DISMISSED',
      decisionNote: 'Le contenu ne contrevient à aucune règle.',
      actorId: moderator.id, actorRole: 'MODERATION',
      expectedUpdatedAt: fresh.updatedAt.toISOString(),
    })

    const untouched = await prisma.course.findUniqueOrThrow({ where: { id: course.id } })
    expect(untouched.status).toBe('published')
  })

  it('seule une ressource peut être retirée', async () => {
    const { learner, moderator, profile } = await setup()
    const report = await createReport(learner.id, {
      targetType: 'USER', targetId: profile.userId, reason: 'HARASSMENT',
    })
    const fresh = await prisma.report.findUniqueOrThrow({ where: { id: report.id } })

    await expect(
      resolveReport(report.id, {
        status: 'UPHELD', decisionNote: 'Propos inacceptables constatés.', hideTarget: true,
        actorId: moderator.id, actorRole: 'MODERATION',
        expectedUpdatedAt: fresh.updatedAt.toISOString(),
      }),
    ).rejects.toThrow('TARGET_NOT_HIDEABLE')
  })

  it('un même compte ne signale pas deux fois le même objet', async () => {
    const { learner, course } = await setup()
    await createReport(learner.id, { targetType: 'COURSE', targetId: course.id, reason: 'SPAM' })

    await expect(
      createReport(learner.id, { targetType: 'COURSE', targetId: course.id, reason: 'ILLEGAL' }),
    ).rejects.toThrow('REPORT_ALREADY_OPEN')
  })

  it('une cible supprimée n\'empêche pas d\'instruire', async () => {
    const { learner, course } = await setup()
    const report = await createReport(learner.id, {
      targetType: 'COURSE', targetId: course.id, reason: 'OTHER',
    })
    await prisma.course.delete({ where: { id: course.id } })

    const detail = await getReportDetail(report.id)
    expect(detail.target.exists).toBe(false)
    expect(detail.target.label).toBe('Ressource supprimée')
  })

  it('compte les signalements ouverts par type de cible', async () => {
    const { learner, course, profile } = await setup()
    await createReport(learner.id, { targetType: 'COURSE', targetId: course.id, reason: 'SPAM' })
    await createReport(learner.id, { targetType: 'USER', targetId: profile.userId, reason: 'HARASSMENT' })

    const stats = await getReportStats()
    expect(stats.open).toBe(2)
    expect(stats.openByTarget.COURSE).toBe(1)
  })

  // -------------------------------------------------------------------------
  // Décision 59 — le tarif est daté, jamais rétroactif. Décision 62 — la
  // réduction la plus favorable l'emporte, elles ne s'additionnent jamais.
  describe('tarification', () => {
    async function superAdmin() {
      return prisma.user.create({
        data: { email: 'super@test.com', role: 'ADMIN', adminRole: 'SUPER_ADMIN' },
      })
    }

    it('poser un tarif borne le précédent sans le réécrire', async () => {
      const admin = await superAdmin()
      const first = await setTariff({
        cadence: 'MONTHLY', amountFcfa: 0, validFrom: new Date(),
        label: 'Gratuité de lancement', actorId: admin.id,
      })

      const later = new Date(Date.now() + 30 * 86_400_000)
      await setTariff({ cadence: 'MONTHLY', amountFcfa: 5_000, validFrom: later, actorId: admin.id })

      const bounded = await prisma.platformTariff.findUniqueOrThrow({ where: { id: first.id } })
      expect(bounded.amountFcfa).toBe(0)
      expect(bounded.validUntil?.getTime()).toBe(later.getTime())

      // Le tarif d'aujourd'hui reste celui de lancement.
      expect((await getCurrentTariff('MONTHLY'))?.amountFcfa).toBe(0)
      // Celui du mois prochain est le nouveau.
      expect((await getCurrentTariff('MONTHLY', new Date(later.getTime() + 1000)))?.amountFcfa).toBe(5_000)
    })

    it('refuse un tarif rétroactif', async () => {
      const admin = await superAdmin()
      await expect(
        setTariff({
          cadence: 'MONTHLY', amountFcfa: 5_000,
          validFrom: new Date(Date.now() - 86_400_000), actorId: admin.id,
        }),
      ).rejects.toThrow('TARIFF_DATE_IN_PAST')
    })

    it('la réduction la plus favorable l\'emporte, sans addition', async () => {
      const admin = await superAdmin()
      const trainerUser = await prisma.user.create({ data: { email: 'f2@test.com', role: 'TRAINER' } })
      const profile = await prisma.trainerProfile.create({ data: { userId: trainerUser.id } })

      await setTariff({ cadence: 'MONTHLY', amountFcfa: 10_000, validFrom: new Date(), actorId: admin.id })
      await createDiscount({
        kind: 'CAMPAIGN', label: 'Rentrée', amountFcfa: 2_000,
        validFrom: new Date(), actorId: admin.id, actorRole: 'SUPER_ADMIN',
      })
      await createDiscount({
        kind: 'TRAINER', label: 'Partenaire', amountFcfa: 3_500,
        trainerId: profile.id, reason: 'Ambassadeur',
        validFrom: new Date(), actorId: admin.id, actorRole: 'SUPER_ADMIN',
      })

      const quote = await quotePrice('MONTHLY', { trainerId: profile.id })
      // 2 000 + 3 500 = 5 500 si elles s'additionnaient : c'est exactement ce
      // que la décision 62 refuse.
      expect(quote.discountFcfa).toBe(3_500)
      expect(quote.payableFcfa).toBe(6_500)
      expect(quote.discountLabel).toBe('Partenaire')
      expect(quote.consideredCount).toBe(2)
    })

    it('un code promo épuisé ne s\'applique plus', async () => {
      const admin = await superAdmin()
      await setTariff({ cadence: 'MONTHLY', amountFcfa: 10_000, validFrom: new Date(), actorId: admin.id })
      const discount = await createDiscount({
        kind: 'PROMO_CODE', label: 'Lancement', amountFcfa: 4_000, code: 'LANCE26',
        maxUses: 1, validFrom: new Date(), actorId: admin.id, actorRole: 'SUPER_ADMIN',
      })

      expect((await quotePrice('MONTHLY', { promoCode: 'LANCE26' })).payableFcfa).toBe(6_000)

      await prisma.platformDiscount.update({ where: { id: discount.id }, data: { usedCount: 1 } })
      expect((await quotePrice('MONTHLY', { promoCode: 'LANCE26' })).payableFcfa).toBe(10_000)
    })

    it('une réduction ne descend jamais sous zéro', async () => {
      const admin = await superAdmin()
      await setTariff({ cadence: 'MONTHLY', amountFcfa: 3_000, validFrom: new Date(), actorId: admin.id })
      await createDiscount({
        kind: 'CAMPAIGN', label: 'Trop généreuse', amountFcfa: 9_000,
        validFrom: new Date(), actorId: admin.id, actorRole: 'SUPER_ADMIN',
      })

      const quote = await quotePrice('MONTHLY')
      expect(quote.payableFcfa).toBe(0)
      expect(quote.discountFcfa).toBe(3_000)
    })

    it('une remise nominative sans motif est refusée', async () => {
      const admin = await superAdmin()
      await expect(
        createDiscount({
          kind: 'TRAINER', label: 'Sans motif', amountFcfa: 1_000,
          validFrom: new Date(), actorId: admin.id, actorRole: 'SUPER_ADMIN',
        }),
      ).rejects.toThrow('TRAINER_DISCOUNT_NEEDS_REASON')
    })
  })
})
