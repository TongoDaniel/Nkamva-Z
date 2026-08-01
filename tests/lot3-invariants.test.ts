// ==========================================================================
// Lot 3 — Invariants KYC, vérification RIB & retraits
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { computeKycScore } from '@/lib/kyc'
import {
  createPayoutMethod, verifyPayoutMethod, rejectPayoutMethod, confirmMicroDeposit,
  expirePayoutMethodCarence, resolvePayoutMethodEscalation,
  PAYOUT_METHOD_CARENCE_HOURS, PAYOUT_METHOD_MAX_REJECTIONS,
} from '@/lib/payout-methods'
import {
  requestPayout, approvePayout, rejectPayout, markPayoutPaid, markPayoutFailed, reopenPayout,
} from '@/lib/payouts'
import { reconcileWalletField } from '@/lib/wallet-reconciliation'

describe('Lot 3 — KYC, RIB & retraits', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setupTrainer(opts: { balance?: number; approvedDaysAgo?: number; legalName?: string | null } = {}) {
    const user = await prisma.user.create({ data: { email: 'formateur@test.com', role: 'TRAINER' } })
    const profile = await prisma.trainerProfile.create({
      data: {
        userId: user.id,
        verifiedLegalName: opts.legalName === undefined ? 'Marie Formatrice' : opts.legalName,
        approvedAt: new Date(Date.now() - (opts.approvedDaysAgo ?? 40) * 86400000),
      },
    })
    const wallet = await prisma.wallet.create({
      data: { trainerId: profile.id, balance: opts.balance ?? 100_000 },
    })
    const finance = await prisma.user.create({
      data: { email: 'finances@test.com', role: 'ADMIN', adminRole: 'FINANCES' },
    })
    const superAdmin = await prisma.user.create({
      data: { email: 'super@test.com', role: 'ADMIN', adminRole: 'SUPER_ADMIN' },
    })
    return { user, profile, wallet, finance, superAdmin }
  }

  /** Pièce d'identité approuvée : le critère PI (+40) est satisfait. */
  async function approveIdCard(userId: string) {
    const application = await prisma.trainerApplication.create({
      data: { userId, status: 'APPROVED', approvedAt: new Date() },
    })
    await prisma.trainerDocument.create({
      data: {
        applicationId: application.id, type: 'ID_CARD', status: 'APPROVED',
        isCurrent: true, s3Key: 'k', sha256: 'x'.repeat(64), sizeBytes: 10,
      },
    })
  }

  const IBAN_INPUT = {
    type: 'BANK_IBAN' as const, accountNature: 'INDIVIDUAL' as const,
    holderName: 'Marie Formatrice', iban: 'FR7630006000011234567890189', bic: 'AGRIFRPP',
  }

  async function freshMethod(id: string) {
    const m = await prisma.payoutMethod.findUniqueOrThrow({ where: { id } })
    return m.updatedAt.toISOString()
  }

  /** Amène un moyen de paiement jusqu'à VERIFIED hors carence. */
  async function verifiedMethod(profileId: string, userId: string, financeId: string) {
    const method = await createPayoutMethod(profileId, userId, IBAN_INPUT)
    await verifyPayoutMethod(method.id, {
      method: 'MANUAL_FINANCE', expectedUpdatedAt: await freshMethod(method.id),
      actorId: financeId, actorRole: 'FINANCES',
    })
    await prisma.payoutMethod.update({
      where: { id: method.id }, data: { carenceUntil: new Date(Date.now() - 1000) },
    })
    await expirePayoutMethodCarence()
    return prisma.payoutMethod.findUniqueOrThrow({ where: { id: method.id } })
  }

  // -------------------------------------------------------------------------
  it('KYC : 0 sans rien, 50 avec PI + ancienneté, 100 avec RIB vérifié', async () => {
    const { user, profile, finance } = await setupTrainer({ approvedDaysAgo: 0 })

    // Aucun critère : profil trop jeune, pas de PI, pas de RIB, pas de vente
    let kyc = await computeKycScore(profile.id)
    expect(kyc.score).toBe(0)
    expect(kyc.badge).toBe('UNVERIFIED')

    // PI approuvée (+40) et ancienneté ≥ 30 j (+10)
    await approveIdCard(user.id)
    await prisma.trainerProfile.update({
      where: { id: profile.id }, data: { approvedAt: new Date(Date.now() - 40 * 86400000) },
    })
    kyc = await computeKycScore(profile.id)
    expect(kyc.score).toBe(50)
    expect(kyc.badge).toBe('TO_VERIFY')
    expect(kyc.criteria).toMatchObject({ piVerified: true, seniority30Days: true, ribVerified: false })

    // 3 ventes propres (+10) et aucun litige ouvert sur activité réelle (+10)
    const learner = await prisma.user.create({ data: { email: 'apprenant@test.com', role: 'LEARNER' } })
    for (let i = 0; i < 3; i++) {
      await prisma.purchase.create({
        data: {
          learnerId: learner.id, trainerId: profile.id, amountFcfa: 10000,
          commissionRate: 0.15, trainerShareFcfa: 8500, platformShareFcfa: 1500,
          provider: 'STRIPE', providerTransactionId: `pi_kyc_${i}`, providerStatus: 'SUCCEEDED',
        },
      })
    }
    kyc = await computeKycScore(profile.id)
    expect(kyc.score).toBe(70)

    // RIB vérifié hors carence (+30) → 100
    await verifiedMethod(profile.id, user.id, finance.id)
    kyc = await computeKycScore(profile.id)
    expect(kyc.score).toBe(100)
    expect(kyc.badge).toBe('VERIFIED')
  })

  // -------------------------------------------------------------------------
  it('KYC : noOpenDispute vaut 0 sans aucune vente réglée', async () => {
    const { user, profile } = await setupTrainer()
    await approveIdCard(user.id)

    const kyc = await computeKycScore(profile.id)
    // PI 40 + ancienneté 10, mais pas les 10 points « aucun litige » :
    // le critère ne récompense que l'absence de litige sur activité réelle.
    expect(kyc.score).toBe(50)
    expect(kyc.criteria.noOpenDispute).toBe(false)
    expect(kyc.details.totalCompletedSales).toBe(0)
  })

  // -------------------------------------------------------------------------
  it('PM1 — carence 72 h posée, ancien moyen archivé (décision 26)', async () => {
    const { user, profile } = await setupTrainer()

    const first = await createPayoutMethod(profile.id, user.id, IBAN_INPUT)
    expect(first.verificationStatus).toBe('PENDING_REVIEW')
    expect(first.carenceUntil).not.toBeNull()
    const carenceHours = (first.carenceUntil!.getTime() - Date.now()) / 3_600_000
    expect(carenceHours).toBeGreaterThan(PAYOUT_METHOD_CARENCE_HOURS - 1)

    const second = await createPayoutMethod(profile.id, user.id, {
      ...IBAN_INPUT, iban: 'FR7630006000011234567890190',
    })

    const archived = await prisma.payoutMethod.findUniqueOrThrow({ where: { id: first.id } })
    expect(archived.isActive).toBe(false)
    expect(archived.verificationStatus).toBe('ARCHIVED')
    expect(archived.archivedAt).not.toBeNull()

    const actives = await prisma.payoutMethod.count({ where: { trainerId: profile.id, isActive: true } })
    expect(actives).toBe(1)
    expect(second.isActive).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Décision 22 — aucune vérification purement déclarative : recopier le nom
  // légal ne suffit PAS à auto-vérifier, faute d'API opérateur.
  it('PM1 — MOBILE_MONEY avec nom identique ne s\'auto-vérifie pas', async () => {
    const { user, profile } = await setupTrainer()

    const method = await createPayoutMethod(profile.id, user.id, {
      type: 'MOBILE_MONEY', accountNature: 'INDIVIDUAL',
      holderName: 'Marie Formatrice', // identique au verifiedLegalName
      mobileOperator: 'WAVE', mobilePhone: '+221770000000',
    })

    expect(method.verificationStatus).toBe('PENDING_REVIEW')
    expect(method.nameLookupResult).toBe('UNAVAILABLE')
    expect(method.verificationMethod).toBeNull()

    // Et il ne compte pas au KYC tant qu'il n'est pas VERIFIED
    const kyc = await computeKycScore(profile.id)
    expect(kyc.criteria.ribVerified).toBe(false)
  })

  // -------------------------------------------------------------------------
  it('PM6 — 3 rejets → BLOCKED et compteur porté par le formateur', async () => {
    const { user, profile, finance } = await setupTrainer()

    for (let attempt = 1; attempt <= PAYOUT_METHOD_MAX_REJECTIONS; attempt++) {
      const method = await createPayoutMethod(profile.id, user.id, {
        ...IBAN_INPUT, iban: `FR763000600001123456789018${attempt}`,
      })
      await rejectPayoutMethod(method.id, {
        reason: 'Le nom du compte ne correspond pas à l\'identité vérifiée.',
        expectedUpdatedAt: await freshMethod(method.id),
        actorId: finance.id, actorRole: 'FINANCES',
      })
      const refreshed = await prisma.payoutMethod.findUniqueOrThrow({ where: { id: method.id } })
      expect(refreshed.verificationStatus).toBe(attempt < PAYOUT_METHOD_MAX_REJECTIONS ? 'REJECTED' : 'BLOCKED')
    }

    // Décision 23 — le compteur vit sur le formateur, l'archivage ne le remet pas à zéro
    const refreshedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(refreshedUser.payoutMethodRejectionCount).toBe(PAYOUT_METHOD_MAX_REJECTIONS)

    // Plus aucune soumission possible
    await expect(createPayoutMethod(profile.id, user.id, IBAN_INPUT)).rejects.toThrow('PAYOUT_METHOD_BLOCKED')
  })

  // -------------------------------------------------------------------------
  it('PM3/PM4 — micro-virements : montants faux comptent comme un rejet, montants justes vérifient', async () => {
    const { user, profile, finance } = await setupTrainer()
    const method = await createPayoutMethod(profile.id, user.id, IBAN_INPUT)

    await verifyPayoutMethod(method.id, {
      method: 'MICRO_DEPOSIT', expectedUpdatedAt: await freshMethod(method.id),
      actorId: finance.id, actorRole: 'FINANCES',
    })

    const issued = await prisma.payoutMethod.findUniqueOrThrow({ where: { id: method.id } })
    expect(issued.verificationMethod).toBe('MICRO_DEPOSIT')
    expect(issued.microDepositAmount1).not.toBe(issued.microDepositAmount2)
    expect(issued.verificationStatus).toBe('PENDING_REVIEW')

    // Montants faux → échec compté comme rejet
    const wrong = (issued.microDepositAmount1! % 99) + 1
    await expect(
      confirmMicroDeposit(method.id, profile.id, user.id, { amount1: wrong, amount2: wrong }),
    ).rejects.toThrow()
    const afterFail = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(afterFail.payoutMethodRejectionCount).toBe(1)

    // Bons montants, ordre inversé → accepté
    await prisma.payoutMethod.update({ where: { id: method.id }, data: { verificationStatus: 'PENDING_REVIEW' } })
    const confirmed = await confirmMicroDeposit(method.id, profile.id, user.id, {
      amount1: issued.microDepositAmount2!, amount2: issued.microDepositAmount1!,
    })
    expect(confirmed.verificationStatus).toBe('MANUAL_VERIFIED')
    expect(confirmed.microDepositVerifiedAt).not.toBeNull()
  })

  // -------------------------------------------------------------------------
  it('P1 — pendingPayoutBalance incrémenté, premier retrait forcé en revue (décision 25)', async () => {
    const { user, profile, wallet, finance } = await setupTrainer({ balance: 100_000 })
    await approveIdCard(user.id)
    await verifiedMethod(profile.id, user.id, finance.id)

    const payout = await requestPayout(profile.id, user.id, 50_000)

    // PI 40 + RIB 30 + ancienneté 10 = 80, soit le seuil d'auto-approbation…
    expect(payout.kycScoreSnapshot).toBe(80)
    // …mais c'est le premier retrait : la revue manuelle reste obligatoire.
    expect(payout.isFirstPayout).toBe(true)
    expect(payout.status).toBe('IN_REVIEW')

    const refreshed = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })
    expect(refreshed.pendingPayoutBalance).toBe(50_000)
    expect(refreshed.balance).toBe(100_000) // pas encore débité

    // Un seul retrait en vol à la fois
    await expect(requestPayout(profile.id, user.id, 10_000)).rejects.toThrow('PAYOUT_IN_PROGRESS')
  })

  // -------------------------------------------------------------------------
  it('P2 — le 2e retrait s\'auto-approuve si le score est ≥ 80 (décision 25)', async () => {
    const { user, profile, finance } = await setupTrainer({ balance: 200_000 })
    await approveIdCard(user.id)
    await verifiedMethod(profile.id, user.id, finance.id)

    // 1er retrait : revue manuelle imposée, puis versé
    const first = await requestPayout(profile.id, user.id, 20_000)
    expect(first.status).toBe('IN_REVIEW')
    const fresh = await prisma.payout.findUniqueOrThrow({ where: { id: first.id } })
    await approvePayout(first.id, {
      expectedUpdatedAt: fresh.updatedAt.toISOString(), actorId: finance.id, actorRole: 'FINANCES',
    })
    await markPayoutPaid(first.id, { actorId: finance.id, actorRole: 'FINANCES' })

    // 2e retrait : firstPayout est faux, le score reste ≥ 80 → auto-approuvé
    const second = await requestPayout(profile.id, user.id, 20_000)
    expect(second.isFirstPayout).toBe(false)
    expect(second.status).toBe('AUTO_APPROVED')
    expect(second.idempotencyKey).toBe(`payout:${second.id}`)
    expect(second.wireInitiatedAt).not.toBeNull()
  })

  // -------------------------------------------------------------------------
  it('P6 — versement : pendingPayoutBalance ET balance décrémentés', async () => {
    const { user, profile, wallet, finance } = await setupTrainer({ balance: 100_000 })
    await verifiedMethod(profile.id, user.id, finance.id)

    const payout = await requestPayout(profile.id, user.id, 40_000)
    const fresh = await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } })
    await approvePayout(payout.id, {
      expectedUpdatedAt: fresh.updatedAt.toISOString(), actorId: finance.id, actorRole: 'FINANCES',
    })
    await markPayoutPaid(payout.id, { providerReference: 'wire_1', actorId: finance.id, actorRole: 'FINANCES' })

    const refreshed = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })
    expect(refreshed.pendingPayoutBalance).toBe(0)
    expect(refreshed.balance).toBe(60_000)

    // Rejeu du versement : idempotent
    await markPayoutPaid(payout.id, { providerReference: 'wire_1', actorId: finance.id, actorRole: 'FINANCES' })
    const again = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })
    expect(again.balance).toBe(60_000)
  })

  // -------------------------------------------------------------------------
  it('P5 — rejet : pendingPayoutBalance libéré, balance intacte', async () => {
    const { user, profile, wallet, finance } = await setupTrainer({ balance: 100_000 })
    await verifiedMethod(profile.id, user.id, finance.id)

    const payout = await requestPayout(profile.id, user.id, 30_000)
    const fresh = await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } })
    await rejectPayout(payout.id, {
      reason: 'Coordonnées bancaires à confirmer avant versement.',
      expectedUpdatedAt: fresh.updatedAt.toISOString(), actorId: finance.id, actorRole: 'FINANCES',
    })

    const refreshed = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })
    expect(refreshed.pendingPayoutBalance).toBe(0)
    expect(refreshed.balance).toBe(100_000)
  })

  // -------------------------------------------------------------------------
  it('P7/P8 — échec puis reprise : l\'engagement retombe puis se repose', async () => {
    const { user, profile, wallet, finance } = await setupTrainer({ balance: 100_000 })
    await verifiedMethod(profile.id, user.id, finance.id)

    const payout = await requestPayout(profile.id, user.id, 25_000)
    const fresh = await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } })
    await approvePayout(payout.id, {
      expectedUpdatedAt: fresh.updatedAt.toISOString(), actorId: finance.id, actorRole: 'FINANCES',
    })

    await markPayoutFailed(payout.id, { reason: 'IBAN refusé par la banque', actorId: null, actorRole: 'SYSTEM' })
    let refreshed = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })
    expect(refreshed.pendingPayoutBalance).toBe(0)
    expect(refreshed.balance).toBe(100_000)

    await reopenPayout(payout.id, { actorId: finance.id, actorRole: 'FINANCES' })
    refreshed = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })
    expect(refreshed.pendingPayoutBalance).toBe(25_000)
    expect((await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } })).status).toBe('IN_REVIEW')
  })

  // -------------------------------------------------------------------------
  it('carence : un moyen de paiement en carence bloque le retrait', async () => {
    const { user, profile, finance } = await setupTrainer({ balance: 100_000 })
    const method = await createPayoutMethod(profile.id, user.id, IBAN_INPUT)
    await verifyPayoutMethod(method.id, {
      method: 'MANUAL_FINANCE', expectedUpdatedAt: await freshMethod(method.id),
      actorId: finance.id, actorRole: 'FINANCES',
    })

    // MANUAL_VERIFIED mais carence en cours → pas encore retirable
    await expect(requestPayout(profile.id, user.id, 20_000)).rejects.toThrow('PAYOUT_METHOD_CARENCE')

    // PM5 — la carence expire, le job bascule en VERIFIED
    await prisma.payoutMethod.update({
      where: { id: method.id }, data: { carenceUntil: new Date(Date.now() - 1000) },
    })
    expect((await expirePayoutMethodCarence()).verified).toBe(1)
    expect((await prisma.payoutMethod.findUniqueOrThrow({ where: { id: method.id } })).verificationStatus).toBe('VERIFIED')

    const payout = await requestPayout(profile.id, user.id, 20_000)
    expect(payout.status).toBe('IN_REVIEW')
  })

  // -------------------------------------------------------------------------
  it('solde retirable : reservedBalance et pendingPayoutBalance bloquent le retrait', async () => {
    const { user, profile, wallet, finance } = await setupTrainer({ balance: 100_000 })
    await verifiedMethod(profile.id, user.id, finance.id)

    // Un litige réserve 60 000 : il ne reste que 40 000 retirables
    await prisma.wallet.update({ where: { id: wallet.id }, data: { reservedBalance: 60_000 } })

    await expect(requestPayout(profile.id, user.id, 50_000)).rejects.toThrow('INSUFFICIENT_WITHDRAWABLE_BALANCE')

    const payout = await requestPayout(profile.id, user.id, 40_000)
    expect(payout.status).toBe('IN_REVIEW')

    // Tout le solde retirable est désormais engagé
    const refreshed = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })
    expect(refreshed.balance - refreshed.reservedBalance - refreshed.pendingPayoutBalance).toBe(0)
  })

  // -------------------------------------------------------------------------
  it('PM8 — escalade Super-admin : débloque, relance la carence, remet le compteur à zéro', async () => {
    const { user, profile, finance, superAdmin } = await setupTrainer()

    let blockedId = ''
    for (let attempt = 1; attempt <= PAYOUT_METHOD_MAX_REJECTIONS; attempt++) {
      const method = await createPayoutMethod(profile.id, user.id, {
        ...IBAN_INPUT, iban: `FR763000600001123456789017${attempt}`,
      })
      await rejectPayoutMethod(method.id, {
        reason: 'Nom du titulaire non concordant avec l\'identité vérifiée.',
        expectedUpdatedAt: await freshMethod(method.id),
        actorId: finance.id, actorRole: 'FINANCES',
      })
      blockedId = method.id
    }

    // Finances ne peut pas trancher seule : c'est le Super-admin qui débloque
    const resolved = await resolvePayoutMethodEscalation(blockedId, {
      action: 'FORCE_VERIFY',
      justification: 'Pièces complémentaires reçues et vérifiées par le Super-admin.',
      actorId: superAdmin.id,
    })

    expect(resolved.verificationStatus).toBe('MANUAL_VERIFIED')
    expect(resolved.verificationMethod).toBe('ESCALATION')
    expect(resolved.carenceUntil!.getTime()).toBeGreaterThan(Date.now())

    const refreshedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(refreshedUser.payoutMethodRejectionCount).toBe(0)
  })

  // -------------------------------------------------------------------------
  it('réconciliation Super-admin : corrige l\'écart et laisse une trace', async () => {
    const { profile, wallet, superAdmin } = await setupTrainer({ balance: 100_000 })

    // Écart introduit artificiellement : aucune FundReservation ACTIVE
    await prisma.wallet.update({ where: { id: wallet.id }, data: { reservedBalance: 12_750 } })

    const result = await reconcileWalletField(wallet.id, 'reservedBalance', {
      actorId: superAdmin.id, reason: 'Écart détecté par le job de cohérence quotidien.',
    })
    expect(result.corrected).toBe(true)
    expect(result.previousValue).toBe(12_750)
    expect(result.newValue).toBe(0)
    expect(result.delta).toBe(-12_750)

    const line = await prisma.walletReconciliation.findFirstOrThrow({ where: { walletId: wallet.id } })
    expect(line.field).toBe('reservedBalance')
    expect(line.reconciledById).toBe(superAdmin.id)

    // Idempotent : plus d'écart, plus de correction
    expect((await reconcileWalletField(wallet.id, 'reservedBalance', {
      actorId: superAdmin.id, reason: 'Second passage de contrôle.',
    })).corrected).toBe(false)
    expect(await prisma.walletReconciliation.count({ where: { walletId: wallet.id } })).toBe(1)
    expect(profile.id).toBeTruthy()
  })
})
