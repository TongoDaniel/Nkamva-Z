// ==========================================================================
// Audit des cas limites du 28 octobre 2026 — A2 à A6
// ==========================================================================
// A2  le fichier d'une ressource vendue est figé ;
// A3  un reliquat invendable n'empêche plus de supprimer son compte ;
// A4  les membres d'un formateur suspendu ne sont plus facturés ;
// A5  le prix d'une communauté a un plafond ;
// A6  une hausse de prix est annoncée, et attend l'échéance d'après.
// ==========================================================================
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { createCourse, confirmCourseUpload, presignCourseUpload } from '@/lib/courses'
import { createCommunity, updateCommunity, COMMUNITY_MAX_PRICE_FCFA } from '@/lib/communities'
import { renewDueMemberships } from '@/lib/memberships'
import { requestDeletion } from '@/lib/profile'
import { purgeDeletedAccounts } from '@/lib/jobs/purge-deleted-accounts'
import { CLOSING_PAYOUT_FEE_FCFA } from '@/lib/payouts'

const JOUR = 86_400_000

describe('Cas limites de l\'argent (audit du 28 octobre 2026)', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function unFormateur(email = 'formateur@test.com') {
    const user = await prisma.user.create({ data: { email, role: 'TRAINER', fullName: 'Awa Sarr' } })
    const profile = await prisma.trainerProfile.create({
      data: { userId: user.id, approvedAt: new Date(), verifiedLegalName: 'Awa Sarr' },
    })
    await prisma.wallet.create({ data: { trainerId: profile.id, balance: 0 } })
    return { user, profile }
  }

  /** Une communauté et un membre dont la période payée s'achève maintenant. */
  async function unMembreEnFinDePeriode(priceFcfa = 2500) {
    const { user, profile } = await unFormateur()
    const community = await prisma.community.create({
      data: {
        trainerId: profile.id, name: 'Les artisans du back', slug: 'artisans-back',
        priceFcfa, commissionRate: 0.15,
      },
    })
    const learner = await prisma.user.create({ data: { email: 'membre@test.com', role: 'LEARNER' } })
    const periodStart = new Date(Date.now() - 31 * JOUR)
    const periodEnd = new Date(Date.now() - 60_000)
    await prisma.purchase.create({
      data: {
        learnerId: learner.id, trainerId: profile.id, communityId: community.id,
        amountFcfa: priceFcfa, commissionRate: 0.15,
        trainerShareFcfa: Math.round(priceFcfa * 0.85), platformShareFcfa: priceFcfa - Math.round(priceFcfa * 0.85),
        provider: 'PAWAPAY', providerStatus: 'SUCCEEDED', providerTransactionId: `dep-${crypto.randomUUID()}`,
        periodStart, periodEnd,
      },
    })
    const membership = await prisma.communitySubscription.create({
      data: { communityId: community.id, learnerId: learner.id, status: 'ACTIVE', periodStart, periodEnd, provider: 'PAWAPAY' },
    })
    return { user, profile, community, learner, membership, periodStart, periodEnd }
  }

  // ── A2 ──────────────────────────────────────────────────────────────────

  describe('A2 — le fichier d\'une ressource vendue', () => {
    async function uneRessourceVendue() {
      const { user, profile } = await unFormateur()
      const course = await createCourse(profile.id, user.id, {
        title: 'Masterclass Node.js', blurb: 'Apprenez Node.js', description: 'Un cours complet.',
        category: 'dev', format: 'video', priceFcfa: 15000,
      })
      await confirmCourseUpload(course.id, profile.id, user.id, {
        s3Key: `course-assets/${course.id}/video-original.mp4`, kind: 'video', mimeType: 'video/mp4',
      })
      await prisma.course.update({ where: { id: course.id }, data: { obligationAt: new Date() } })
      return { user, profile, course }
    }

    it('ne se remplace plus, ni à la confirmation ni dès la présignature', async () => {
      const { user, profile, course } = await uneRessourceVendue()

      await expect(confirmCourseUpload(course.id, profile.id, user.id, {
        s3Key: `course-assets/${course.id}/video-remplacant.mp4`, kind: 'video', mimeType: 'video/mp4',
      })).rejects.toThrow('COURSE_CONTENT_LOCKED')
      await expect(presignCourseUpload(course.id, profile.id, {
        kind: 'video', mimeType: 'video/mp4', sizeBytes: 1_000_000,
      })).rejects.toThrow('COURSE_CONTENT_LOCKED')

      const after = await prisma.course.findUniqueOrThrow({ where: { id: course.id } })
      expect(after.contentS3Key).toBe(`course-assets/${course.id}/video-original.mp4`)
    })

    it('laisse changer la couverture', async () => {
      const { user, profile, course } = await uneRessourceVendue()
      const updated = await confirmCourseUpload(course.id, profile.id, user.id, {
        s3Key: `course-assets/${course.id}/image-nouvelle.png`, kind: 'image', mimeType: 'image/png',
      })
      expect(updated.coverS3Key).toBe(`course-assets/${course.id}/image-nouvelle.png`)
    })

    it('se remplace tant que rien n\'est vendu, et la trace garde l\'ancien fichier', async () => {
      const { user, profile } = await unFormateur()
      const course = await createCourse(profile.id, user.id, {
        title: 'Masterclass Node.js', blurb: 'Apprenez Node.js', description: 'Un cours complet.',
        category: 'dev', format: 'video', priceFcfa: 15000,
      })
      const first = `course-assets/${course.id}/video-1.mp4`
      const second = `course-assets/${course.id}/video-2.mp4`
      await confirmCourseUpload(course.id, profile.id, user.id, { s3Key: first, kind: 'video', mimeType: 'video/mp4' })
      await confirmCourseUpload(course.id, profile.id, user.id, { s3Key: second, kind: 'video', mimeType: 'video/mp4' })

      const trace = await prisma.auditLog.findFirst({
        where: { action: 'COURSE_CONTENT_UPLOADED', targetId: course.id },
        orderBy: { createdAt: 'desc' },
      })
      expect((trace?.meta as { replacedS3Key?: string }).replacedS3Key).toBe(first)
    })
  })

  // ── A3 ──────────────────────────────────────────────────────────────────

  describe('A3 — un reliquat que rien ne peut verser', () => {
    it('demande un abandon exprès, puis le débite à l\'effacement', async () => {
      const { user, profile } = await unFormateur()
      await prisma.wallet.update({ where: { trainerId: profile.id }, data: { balance: 300 } })

      expect(await requestDeletion(user.id, profile.id)).toEqual({ ok: false, reason: 'WALLET_RESIDUE' })
      expect((await requestDeletion(user.id, profile.id, { abandonResidue: true })).ok).toBe(true)

      // Rien ne part tant que le délai de grâce court : annuler laisserait l'argent.
      expect((await prisma.wallet.findUniqueOrThrow({ where: { trainerId: profile.id } })).balance).toBe(300)

      await prisma.user.update({
        where: { id: user.id },
        data: { deletionRequestedAt: new Date(Date.now() - 31 * JOUR) },
      })
      await purgeDeletedAccounts()

      const wallet = await prisma.wallet.findUniqueOrThrow({ where: { trainerId: profile.id } })
      expect(wallet.balance).toBe(0)
      const debits = await prisma.walletDebit.findMany({ where: { trainerId: profile.id } })
      expect(debits).toHaveLength(1)
      expect(debits[0]).toMatchObject({ amountFcfa: 300, reason: 'CLOSING_RESIDUE' })
    })

    it('ne vaut pas au-delà des frais d\'un versement de clôture', async () => {
      const { user, profile } = await unFormateur()
      await prisma.wallet.update({
        where: { trainerId: profile.id }, data: { balance: CLOSING_PAYOUT_FEE_FCFA + 1 },
      })
      expect(await requestDeletion(user.id, profile.id, { abandonResidue: true }))
        .toEqual({ ok: false, reason: 'WALLET_NOT_EMPTY' })
    })

    it('ne vaut pas quand des fonds sont réservés par un litige', async () => {
      const { user, profile } = await unFormateur()
      await prisma.wallet.update({
        where: { trainerId: profile.id }, data: { balance: 300, reservedBalance: 300 },
      })
      expect(await requestDeletion(user.id, profile.id, { abandonResidue: true }))
        .toEqual({ ok: false, reason: 'WALLET_NOT_EMPTY' })
    })
  })

  // ── A4 ──────────────────────────────────────────────────────────────────

  describe('A4 — le formateur suspendu', () => {
    it('voit ses adhésions se clore au terme, sans échéance pour ses membres', async () => {
      const { profile, learner, membership } = await unMembreEnFinDePeriode()
      await prisma.trainerProfile.update({
        where: { id: profile.id }, data: { subscriptionStatus: 'SUSPENDED' },
      })

      await renewDueMemberships()

      const after = await prisma.communitySubscription.findUniqueOrThrow({ where: { id: membership.id } })
      expect(after.status).toBe('EXPIRED')
      expect(await prisma.purchase.count({ where: { learnerId: learner.id, providerStatus: 'PENDING' } })).toBe(0)
      const notice = await prisma.notification.findFirst({ where: { userId: learner.id, type: 'MEMBERSHIP_ENDED' } })
      expect(notice?.body).toContain('rien ne vous a été prélevé')
    })

    it('n\'empêche pas le renouvellement d\'un formateur actif', async () => {
      const { learner, membership } = await unMembreEnFinDePeriode()
      await renewDueMemberships()
      expect((await prisma.communitySubscription.findUniqueOrThrow({ where: { id: membership.id } })).status)
        .toBe('PAST_DUE')
      expect(await prisma.purchase.count({ where: { learnerId: learner.id, providerStatus: 'PENDING' } })).toBe(1)
    })
  })

  // ── A5 ──────────────────────────────────────────────────────────────────

  describe('A5 — le plafond du prix d\'adhésion', () => {
    it('refuse au-delà, à la création comme à la modification', async () => {
      const { user, profile } = await unFormateur()
      await expect(createCommunity(profile.id, user.id, {
        name: 'Trop chère', priceFcfa: COMMUNITY_MAX_PRICE_FCFA + 1,
      })).rejects.toThrow('PRICE_TOO_HIGH')

      const community = await createCommunity(profile.id, user.id, { name: 'Raisonnable', priceFcfa: 2500 })
      await expect(updateCommunity(community.id, profile.id, user.id, { priceFcfa: 2_147_483_648 }))
        .rejects.toThrow('PRICE_TOO_HIGH')
    })
  })

  // ── A6 ──────────────────────────────────────────────────────────────────

  describe('A6 — un changement de prix', () => {
    it('prévient les membres, et une hausse attend l\'échéance d\'après', async () => {
      const { user, profile, community, learner, membership, periodEnd } = await unMembreEnFinDePeriode(2500)
      // Le changement tombe pendant la période en cours.
      await updateCommunity(community.id, profile.id, user.id, { priceFcfa: 5000 })

      const notice = await prisma.notification.findFirst({ where: { userId: learner.id, type: 'COMMUNITY_PRICE_CHANGED' } })
      expect(notice?.body).toContain('reste à')

      await renewDueMemberships()
      const due = await prisma.purchase.findFirstOrThrow({
        where: { learnerId: learner.id, providerStatus: 'PENDING' },
      })
      expect(due.amountFcfa).toBe(2500)

      // Un mois plus tard : l'échéance a été réglée, et sa période — celle qui
      // s'achève — a commencé après le changement. Le changement est replacé
      // dans la période précédente, où il a eu lieu ; on raccourcit la période
      // réglée pour la faire échoir maintenant.
      await prisma.community.update({
        where: { id: community.id }, data: { priceChangedAt: new Date(periodEnd.getTime() - JOUR) },
      })
      const finDeLaPeriodeReglee = new Date(Date.now() - 1000)
      await prisma.purchase.update({
        where: { id: due.id }, data: { providerStatus: 'SUCCEEDED', periodEnd: finDeLaPeriodeReglee },
      })
      await prisma.communitySubscription.update({
        where: { id: membership.id },
        data: { status: 'ACTIVE', periodStart: periodEnd, periodEnd: finDeLaPeriodeReglee },
      })

      await renewDueMemberships()
      const next = await prisma.purchase.findFirstOrThrow({
        where: { learnerId: learner.id, providerStatus: 'PENDING' },
      })
      expect(next.amountFcfa).toBe(5000)
    })

    it('applique une baisse dès l\'échéance suivante', async () => {
      const { user, profile, community, learner } = await unMembreEnFinDePeriode(5000)
      await updateCommunity(community.id, profile.id, user.id, { priceFcfa: 3000 })

      await renewDueMemberships()
      const due = await prisma.purchase.findFirstOrThrow({
        where: { learnerId: learner.id, providerStatus: 'PENDING' },
      })
      expect(due.amountFcfa).toBe(3000)
    })
  })
})
