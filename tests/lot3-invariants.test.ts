// ==========================================================================
// Lot 3 — Tests d'invariants (KYC, vérification RIB & payouts)
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { createCourse, publishCourse } from '@/lib/courses'
import { computeKycScore } from '@/lib/kyc'
import { createPayoutMethod, rejectPayoutMethod, PAYOUT_METHOD_MAX_REJECTIONS } from '@/lib/payout-methods'
import { requestPayout, approvePayout, rejectPayout, markPayoutPaid } from '@/lib/payouts'

describe('Lot 3 — KYC, vérification RIB & payouts', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function createTrainer(opts: { approvedDaysAgo?: number } = {}) {
    const user = await prisma.user.create({ data: { email: `trainer-${crypto.randomUUID()}@test.com`, role: 'TRAINER' } })
    const profile = await prisma.trainerProfile.create({
      data: { userId: user.id, verifiedLegalName: 'Jean Dupont', approvedAt: opts.approvedDaysAgo != null ? new Date(Date.now() - opts.approvedDaysAgo * 86400000) : null },
    })
    const wallet = await prisma.wallet.create({ data: { trainerId: profile.id, balance: 0 } })
    return { user, profile, wallet }
  }

  async function createFinanceAdmin() {
    return prisma.user.create({ data: { email: `finance-${crypto.randomUUID()}@test.com`, role: 'ADMIN', adminRole: 'FINANCES' } })
  }

  async function grantApprovedIdCard(userId: string) {
    const app = await prisma.trainerApplication.create({ data: { userId, status: 'APPROVED' } })
    await prisma.trainerDocument.create({ data: { applicationId: app.id, type: 'ID_CARD', status: 'APPROVED', s3Key: 'x', sha256: 'x', sizeBytes: 1 } })
  }

  // Insère directement un PayoutMethod déjà VERIFIED, hors carence (contourne le délai de 72h pour tester le reste)
  async function createVerifiedPayoutMethod(trainerId: string, email: string) {
    return prisma.payoutMethod.create({
      data: {
        trainerId, type: 'BANK_IBAN', accountNature: 'INDIVIDUAL', verifiedLegalNameAtCreation: 'Jean Dupont',
        trainerEmailSnapshot: email, verificationStatus: 'VERIFIED', isActive: true, carenceUntil: new Date(Date.now() - 3600000),
      },
    })
  }

  async function createCleanSale(trainerId: string, courseId: string) {
    const learner = await prisma.user.create({ data: { email: `buyer-${crypto.randomUUID()}@test.com`, role: 'LEARNER' } })
    return prisma.purchase.create({
      data: { learnerId: learner.id, trainerId, courseId, amountFcfa: 5000, commissionRate: 0.15, trainerShareFcfa: 4250, platformShareFcfa: 750, provider: 'STRIPE', providerTransactionId: `pi_${crypto.randomUUID()}`, providerStatus: 'SUCCEEDED' },
    })
  }

  // -------------------------------------------------------------------------
  it('computeKycScore : 0 sans rien', async () => {
    const { profile } = await createTrainer()
    const kyc = await computeKycScore(profile.id)
    expect(kyc.score).toBe(0)
    expect(kyc.badge).toBe('UNVERIFIED')
  })

  // -------------------------------------------------------------------------
  it('computeKycScore : 50 avec PI vérifiée + ancienneté ≥ 30j', async () => {
    const { profile, user } = await createTrainer({ approvedDaysAgo: 40 })
    await grantApprovedIdCard(user.id)
    const kyc = await computeKycScore(profile.id)
    expect(kyc.score).toBe(50) // 40 (PI) + 10 (ancienneté)
    expect(kyc.badge).toBe('TO_VERIFY')
  })

  // -------------------------------------------------------------------------
  it('computeKycScore : 100 avec RIB vérifié + tous les critères', async () => {
    const { profile, user } = await createTrainer({ approvedDaysAgo: 40 })
    await grantApprovedIdCard(user.id)
    await createVerifiedPayoutMethod(profile.id, user.email)

    const course = await createCourse(profile.id, user.id, { title: 'Cours KYC', blurb: 'Blurb', description: 'Description', category: 'dev', format: 'video', priceFcfa: 5000 })
    await publishCourse(course.id, profile.id, user.id)
    for (let i = 0; i < 3; i++) await createCleanSale(profile.id, course.id)

    const kyc = await computeKycScore(profile.id)
    expect(kyc.score).toBe(100)
    expect(kyc.badge).toBe('VERIFIED')
  })

  // -------------------------------------------------------------------------
  it('computeKycScore : noOpenDispute = false si aucune vente SUCCEEDED', async () => {
    const { profile } = await createTrainer()
    const kyc = await computeKycScore(profile.id)
    expect(kyc.criteria.noOpenDispute).toBe(false)
  })

  // -------------------------------------------------------------------------
  it("createPayoutMethod : carence 72h posée + archive l'ancien", async () => {
    const { profile, user } = await createTrainer()
    const first = await createPayoutMethod(profile.id, user.id, { type: 'BANK_IBAN', accountNature: 'INDIVIDUAL', iban: 'FR7630001007941234567890185' })
    expect(first.carenceUntil).not.toBeNull()
    const hours = (first.carenceUntil!.getTime() - Date.now()) / 3600000
    expect(hours).toBeGreaterThan(71)
    expect(hours).toBeLessThanOrEqual(72)

    const second = await createPayoutMethod(profile.id, user.id, { type: 'BANK_IBAN', accountNature: 'INDIVIDUAL', iban: 'FR7630001007941234567890186' })

    const firstAfter = await prisma.payoutMethod.findUniqueOrThrow({ where: { id: first.id } })
    expect(firstAfter.isActive).toBe(false)
    expect(firstAfter.verificationStatus).toBe('ARCHIVED')
    expect(second.isActive).toBe(true)
  })

  // -------------------------------------------------------------------------
  it('createPayoutMethod : MOBILE_MONEY avec nom concordant → AUTO_VERIFIED', async () => {
    const { profile, user } = await createTrainer() // verifiedLegalName = 'Jean Dupont'
    const method = await createPayoutMethod(profile.id, user.id, {
      type: 'MOBILE_MONEY', accountNature: 'INDIVIDUAL', mobileOperator: 'ORANGE_MONEY', mobilePhone: '+2250700000000', holderName: 'Dupont Jean',
    })
    expect(method.verificationStatus).toBe('AUTO_VERIFIED')
    expect(method.nameLookupResult).toBe('MATCH')
  })

  // -------------------------------------------------------------------------
  it(`rejectPayoutMethod : ${PAYOUT_METHOD_MAX_REJECTIONS} rejets → BLOCKED + User.payoutMethodRejectionCount`, async () => {
    const { profile, user } = await createTrainer()
    const admin = await createFinanceAdmin()

    let methodId = (await createPayoutMethod(profile.id, user.id, { type: 'BANK_IBAN', accountNature: 'INDIVIDUAL', iban: 'FR001' })).id

    for (let i = 0; i < PAYOUT_METHOD_MAX_REJECTIONS; i++) {
      await rejectPayoutMethod(methodId, admin.id, `Rejet ${i + 1}`)
      if (i < PAYOUT_METHOD_MAX_REJECTIONS - 1) {
        methodId = (await createPayoutMethod(profile.id, user.id, { type: 'BANK_IBAN', accountNature: 'INDIVIDUAL', iban: `FR00${i + 1}` })).id
      }
    }

    const finalMethod = await prisma.payoutMethod.findUniqueOrThrow({ where: { id: methodId } })
    expect(finalMethod.verificationStatus).toBe('BLOCKED')

    const userAfter = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(userAfter.payoutMethodRejectionCount).toBe(PAYOUT_METHOD_MAX_REJECTIONS)
  })

  // -------------------------------------------------------------------------
  it('requestPayout (P1) : pendingPayoutBalance incrémenté + premier retrait → IN_REVIEW', async () => {
    const { profile, user, wallet } = await createTrainer({ approvedDaysAgo: 40 })
    await prisma.wallet.update({ where: { id: wallet.id }, data: { balance: 50000 } })
    await createVerifiedPayoutMethod(profile.id, user.email)

    const payout = await requestPayout(profile.id, user.id, 20000)
    expect(payout.status).toBe('IN_REVIEW') // premier retrait : toujours en revue, quel que soit le score

    const walletAfter = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })
    expect(walletAfter.pendingPayoutBalance).toBe(20000)
  })

  // -------------------------------------------------------------------------
  it('markPayoutPaid (P6) : pendingPayoutBalance ET balance décrémentés', async () => {
    const { profile, user, wallet } = await createTrainer({ approvedDaysAgo: 40 })
    await prisma.wallet.update({ where: { id: wallet.id }, data: { balance: 50000 } })
    await createVerifiedPayoutMethod(profile.id, user.email)
    const payout = await requestPayout(profile.id, user.id, 20000)
    const admin = await createFinanceAdmin()
    const p = await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } })
    await approvePayout(payout.id, admin.id, p.updatedAt)
    await markPayoutPaid(payout.id, admin.id, 'wire_ref_123')

    const walletAfter = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })
    expect(walletAfter.pendingPayoutBalance).toBe(0)
    expect(walletAfter.balance).toBe(30000) // 50000 - 20000
  })

  // -------------------------------------------------------------------------
  it('rejectPayout (P5) : pendingPayoutBalance décrémenté, balance intacte', async () => {
    const { profile, user, wallet } = await createTrainer({ approvedDaysAgo: 40 })
    await prisma.wallet.update({ where: { id: wallet.id }, data: { balance: 50000 } })
    await createVerifiedPayoutMethod(profile.id, user.email)
    const payout = await requestPayout(profile.id, user.id, 20000)
    const admin = await createFinanceAdmin()
    const p = await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } })
    await rejectPayout(payout.id, admin.id, p.updatedAt, 'RIB non conforme')

    const walletAfter = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })
    expect(walletAfter.pendingPayoutBalance).toBe(0)
    expect(walletAfter.balance).toBe(50000)
  })

  // -------------------------------------------------------------------------
  it('carence bloquée : requestPayout échoue si PayoutMethod en carence', async () => {
    const { profile, user, wallet } = await createTrainer({ approvedDaysAgo: 40 })
    await prisma.wallet.update({ where: { id: wallet.id }, data: { balance: 50000 } })
    await createPayoutMethod(profile.id, user.id, { type: 'BANK_IBAN', accountNature: 'INDIVIDUAL', iban: 'FR001' }) // carence 72h posée
    const method = await prisma.payoutMethod.findFirstOrThrow({ where: { trainerId: profile.id } })
    await prisma.payoutMethod.update({ where: { id: method.id }, data: { verificationStatus: 'VERIFIED' } }) // vérifié mais toujours en carence

    await expect(requestPayout(profile.id, user.id, 20000)).rejects.toThrow('PAYOUT_METHOD_IN_CARENCE')
  })

  // -------------------------------------------------------------------------
  it('solde retirable : reservedBalance + pendingPayoutBalance bloquent le retrait', async () => {
    const { profile, user, wallet } = await createTrainer({ approvedDaysAgo: 40 })
    await prisma.wallet.update({ where: { id: wallet.id }, data: { balance: 50000, reservedBalance: 20000, pendingPayoutBalance: 20000 } })
    await createVerifiedPayoutMethod(profile.id, user.email)

    // retirable = 50000 - 20000 - 20000 = 10000
    await expect(requestPayout(profile.id, user.id, 15000)).rejects.toThrow('INSUFFICIENT_WITHDRAWABLE_BALANCE')

    const payout = await requestPayout(profile.id, user.id, 10000)
    expect(payout.amountFcfa).toBe(10000)
  })
})
