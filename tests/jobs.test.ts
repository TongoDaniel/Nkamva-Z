// ==========================================================================
// Jobs planifiés — câblage node-cron (Lot 0 §6, Lot 1 §8, Lot 2 §7, Lot 3 §7)
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getTasks } from 'node-cron'
import { prisma, cleanDatabase } from './setup'
import { startScheduledJobs } from '@/lib/jobs'
import { alertPayoutMethodSlaBreaches } from '@/lib/payout-methods'
import { reconcileAllWallets, alertNegativeWallets } from '@/lib/wallet-reconciliation'
import { cleanupExpiredPendingAttachments } from '@/lib/pending-attachments'

describe('Jobs planifiés', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function createTrainer() {
    const user = await prisma.user.create({ data: { email: `trainer-${crypto.randomUUID()}@test.com`, role: 'TRAINER' } })
    const profile = await prisma.trainerProfile.create({ data: { userId: user.id, verifiedLegalName: 'Jean Dupont' } })
    const wallet = await prisma.wallet.create({ data: { trainerId: profile.id, balance: 0 } })
    return { user, profile, wallet }
  }

  // -------------------------------------------------------------------------
  it('startScheduledJobs : enregistre les 7 jobs avec les bons patterns cron', () => {
    startScheduledJobs()
    const byName = new Map([...getTasks().values()].map(t => [t.name, t]))

    const expected: Record<string, string> = {
      PAYOUT_METHOD_CARENCE_EXPIRY: '0 * * * *',
      PAYOUT_METHOD_SLA_ALERT: '0 * * * *',
      DISPUTE_AUTO_TIMEOUT: '0 * * * *',
      WALLET_RECONCILIATION: '30 3 * * *',
      WALLET_NEGATIVE_ALERT: '30 3 * * *',
      TRAINER_DOCUMENT_PURGE: '0 3 * * *',
      PENDING_ATTACHMENT_CLEANUP: '0 4 * * *',
    }

    for (const [name, cron] of Object.entries(expected)) {
      const task = byName.get(name)
      expect(task, `job ${name} devrait être enregistré`).toBeDefined()
      expect(task!.getPattern()).toBe(cron)
    }
    expect(getTasks().size).toBe(7)

    // Appeler une seconde fois ne doit pas dupliquer les jobs (idempotent)
    startScheduledJobs()
    expect(getTasks().size).toBe(7)
  })

  // -------------------------------------------------------------------------
  it('alertPayoutMethodSlaBreaches : détecte un RIB PENDING_REVIEW > 48h', async () => {
    const { profile, user } = await createTrainer()
    await prisma.payoutMethod.create({
      data: {
        trainerId: profile.id, type: 'BANK_IBAN', accountNature: 'INDIVIDUAL', verifiedLegalNameAtCreation: 'Jean Dupont',
        trainerEmailSnapshot: user.email, verificationStatus: 'PENDING_REVIEW', isActive: true,
        createdAt: new Date(Date.now() - 50 * 3600000), // 50h
      },
    })
    // Un second RIB, récent, ne doit pas compter
    const { profile: profile2, user: user2 } = await createTrainer()
    await prisma.payoutMethod.create({
      data: {
        trainerId: profile2.id, type: 'BANK_IBAN', accountNature: 'INDIVIDUAL', verifiedLegalNameAtCreation: 'Jean Dupont',
        trainerEmailSnapshot: user2.email, verificationStatus: 'PENDING_REVIEW', isActive: true,
      },
    })

    const count = await alertPayoutMethodSlaBreaches()
    expect(count).toBe(1)
  })

  // -------------------------------------------------------------------------
  it('reconcileAllWallets : corrige un solde dérivé, idempotent au second passage', async () => {
    const { wallet } = await createTrainer()
    // Simule une dérive : reservedBalance ne correspond à aucune FundReservation ACTIVE
    await prisma.wallet.update({ where: { id: wallet.id }, data: { reservedBalance: 5000, pendingPayoutBalance: 3000 } })

    const first = await reconcileAllWallets()
    expect(first.walletsChecked).toBe(1)
    expect(first.discrepanciesFixed).toBe(2) // reservedBalance + pendingPayoutBalance

    const walletAfter = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })
    expect(walletAfter.reservedBalance).toBe(0)
    expect(walletAfter.pendingPayoutBalance).toBe(0)

    const reconciliations = await prisma.walletReconciliation.count({ where: { walletId: wallet.id } })
    expect(reconciliations).toBe(2)

    // Idempotent : rien à corriger au second passage
    const second = await reconcileAllWallets()
    expect(second.discrepanciesFixed).toBe(0)
  })

  // -------------------------------------------------------------------------
  it('alertNegativeWallets : détecte un wallet négatif depuis plus de 60 jours', async () => {
    const { wallet } = await createTrainer()
    await prisma.wallet.update({ where: { id: wallet.id }, data: { negativeSince: new Date(Date.now() - 65 * 86400000) } })

    const { wallet: recentWallet } = await createTrainer()
    await prisma.wallet.update({ where: { id: recentWallet.id }, data: { negativeSince: new Date(Date.now() - 5 * 86400000) } })

    const count = await alertNegativeWallets()
    expect(count).toBe(1)
  })

  // -------------------------------------------------------------------------
  it('cleanupExpiredPendingAttachments : expire les pièces jointes non consommées, idempotent', async () => {
    await prisma.pendingAttachment.create({
      data: { s3Key: 'dispute-attachments/test/expired', issuerId: 'u1', scope: 'DISPUTE_ATTACHMENT', status: 'PENDING', mimeType: 'image/png', sizeBytes: 100, sha256: '', expiresAt: new Date(Date.now() - 1000) },
    })
    await prisma.pendingAttachment.create({
      data: { s3Key: 'dispute-attachments/test/valid', issuerId: 'u1', scope: 'DISPUTE_ATTACHMENT', status: 'PENDING', mimeType: 'image/png', sizeBytes: 100, sha256: '', expiresAt: new Date(Date.now() + 3600000) },
    })

    const count = await cleanupExpiredPendingAttachments()
    expect(count).toBe(1)

    const second = await cleanupExpiredPendingAttachments()
    expect(second).toBe(0) // idempotent : déjà EXPIRED, ne matche plus le filtre status=PENDING
  })
})
