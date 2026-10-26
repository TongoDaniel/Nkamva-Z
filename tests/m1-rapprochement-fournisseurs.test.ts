// ==========================================================================
// Rapprochement avec les fournisseurs — campagne du 12 octobre 2026, M1
// ==========================================================================
// Un retrait `COMPLETED` chez PawaPay est resté `APPROVED` cinq mois chez
// NKAMVA, bloquant tout nouveau retrait. Un remboursement `COMPLETED` est resté
// `PENDING`, et la réserve du litige n'a jamais été libérée. Un règlement
// d'abonnement abouti a laissé la formatrice suspendue. Les trois n'avaient pas
// d'autre chemin que le rappel du fournisseur.
//
// PawaPay est simulé : les tests disent ce qu'il répondrait, et vérifient que
// le rapprochement applique ce qu'aurait appliqué son rappel.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { TransactionSnapshot } from '@/lib/pawapay'

const pawapay = vi.hoisted(() => ({
  checkPayout: vi.fn<(id: string) => Promise<TransactionSnapshot | null>>(),
  checkRefund: vi.fn<(id: string) => Promise<TransactionSnapshot | null>>(),
  checkDeposit: vi.fn<(id: string) => Promise<TransactionSnapshot | null>>(),
}))
vi.mock('@/lib/pawapay', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pawapay')>()),
  isPawaPayConfigured: () => true,
  ...pawapay,
}))

// Le remboursement et le règlement d'abonnement ont leurs propres tests : ici,
// on vérifie qu'ils sont **appelés** avec la bonne transaction, pas ce qu'ils font.
const settlement = vi.hoisted(() => ({
  completeRefund: vi.fn(async () => {}),
  fallBackToManualRefund: vi.fn(async () => {}),
  settleSubscriptionPayment: vi.fn(async () => ({ settled: true })),
  failSubscriptionPayment: vi.fn(async () => true),
}))
vi.mock('@/lib/disputes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/disputes')>()),
  completeRefund: settlement.completeRefund,
  fallBackToManualRefund: settlement.fallBackToManualRefund,
}))
vi.mock('@/lib/subscription-payment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/subscription-payment')>()),
  settleSubscriptionPayment: settlement.settleSubscriptionPayment,
  failSubscriptionPayment: settlement.failSubscriptionPayment,
}))

import { prisma, cleanDatabase } from './setup'
import { reconcileProviderStates, RECONCILE_AFTER_MS } from '@/lib/provider-reconciliation'

/** Assez tard pour que tout ce que le test vient de créer ait dépassé le délai laissé au rappel. */
const later = () => new Date(Date.now() + RECONCILE_AFTER_MS + 60_000)

function snapshot(status: TransactionSnapshot['status'], extra: Partial<TransactionSnapshot> = {}): TransactionSnapshot {
  return { status, ...extra }
}

describe('M1 — rapprochement avec les fournisseurs', () => {
  beforeEach(async () => {
    await cleanDatabase()
    vi.clearAllMocks()
    pawapay.checkPayout.mockResolvedValue(null)
    pawapay.checkRefund.mockResolvedValue(null)
    pawapay.checkDeposit.mockResolvedValue(null)
  })
  afterEach(async () => { await cleanDatabase() })

  async function trainer() {
    const user = await prisma.user.create({ data: { email: 'mariam@test.com', role: 'TRAINER' } })
    const profile = await prisma.trainerProfile.create({ data: { userId: user.id, approvedAt: new Date() } })
    const wallet = await prisma.wallet.create({
      data: { trainerId: profile.id, balance: 20_000, pendingPayoutBalance: 10_000 },
    })
    return { user, profile, wallet }
  }

  async function approvedPayout(trainerId: string, wireInitiatedAt: Date) {
    const method = await prisma.payoutMethod.create({
      data: {
        trainerId, type: 'MOBILE_MONEY', accountNature: 'INDIVIDUAL',
        verifiedLegalNameAtCreation: 'Mariam Diallo', trainerEmailSnapshot: 'mariam@test.com',
        mobileOperator: 'MTN_MOMO', mobilePhone: '237653456789', verificationStatus: 'VERIFIED',
      },
    })
    return prisma.payout.create({
      data: { trainerId, payoutMethodId: method.id, amountFcfa: 10_000, status: 'APPROVED', wireInitiatedAt },
    })
  }

  // --- Retraits ---

  it('un retrait versé chez PawaPay passe payé, et le portefeuille est débité', async () => {
    const { profile } = await trainer()
    const payout = await approvedPayout(profile.id, new Date())
    pawapay.checkPayout.mockResolvedValue(snapshot('COMPLETED', { payoutId: payout.id, providerTransactionId: 'MTN-123' }))

    const result = await reconcileProviderStates(later())

    expect(pawapay.checkPayout).toHaveBeenCalledWith(payout.id)
    expect(result.payouts).toEqual({ checked: 1, paid: 1, failed: 0 })
    const paid = await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } })
    expect(paid.status).toBe('PAID')
    expect(paid.providerReference).toBe('MTN-123')
    // Le retrait bloqué empêchait tout nouveau retrait : il ne reste rien en vol.
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { trainerId: profile.id } })
    expect(wallet.pendingPayoutBalance).toBe(0)
    expect(wallet.balance).toBe(10_000)
  })

  it('un retrait refusé chez PawaPay passe en échec', async () => {
    const { profile } = await trainer()
    const payout = await approvedPayout(profile.id, new Date())
    pawapay.checkPayout.mockResolvedValue(snapshot('FAILED', {
      failureReason: { failureCode: 'RECIPIENT_NOT_FOUND', failureMessage: 'Numéro inconnu' },
    }))

    const result = await reconcileProviderStates(later())

    expect(result.payouts.failed).toBe(1)
    expect((await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } })).status).toBe('FAILED')
  })

  it('un retrait encore dans le délai du rappel n\'est pas interrogé', async () => {
    const { profile } = await trainer()
    await approvedPayout(profile.id, new Date())

    const result = await reconcileProviderStates(new Date())

    expect(pawapay.checkPayout).not.toHaveBeenCalled()
    expect(result.payouts.checked).toBe(0)
  })

  it('une réponse sans verdict ne change rien', async () => {
    const { profile } = await trainer()
    const payout = await approvedPayout(profile.id, new Date())
    pawapay.checkPayout.mockResolvedValue(snapshot('PROCESSING'))

    await reconcileProviderStates(later())

    expect((await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } })).status).toBe('APPROVED')
  })

  // --- Remboursements ---

  it('un remboursement abouti chez PawaPay est conclu, et un refus part en traitement manuel', async () => {
    const { profile } = await trainer()
    const learner = await prisma.user.create({ data: { email: 'paul@test.com', role: 'LEARNER' } })
    const dispute = async (n: number) => {
      const purchase = await prisma.purchase.create({
        data: {
          learnerId: learner.id, trainerId: profile.id, amountFcfa: 5000, commissionRate: 0.15,
          trainerShareFcfa: 4250, platformShareFcfa: 750, provider: 'PAWAPAY',
          providerTransactionId: crypto.randomUUID(), providerStatus: 'SUCCEEDED',
        },
      })
      return prisma.dispute.create({
        data: {
          purchaseId: purchase.id, learnerId: learner.id, trainerId: profile.id,
          source: 'LEARNER_REQUEST', reason: n === 1 ? 'ACCESS_ISSUE' : 'OTHER',
          disputedAmountFcfa: 5000, refundStatus: 'PENDING',
        },
      })
    }
    const done = await dispute(1)
    const refused = await dispute(2)
    pawapay.checkRefund.mockImplementation(async (id) =>
      id === done.id
        ? snapshot('COMPLETED', { refundId: id, providerTransactionId: 'R-1' })
        : snapshot('FAILED', { refundId: id, failureReason: { failureCode: 'DEPOSIT_TOO_OLD' } }),
    )

    const result = await reconcileProviderStates(later())

    expect(result.refunds).toEqual({ checked: 2, completed: 1, failed: 1 })
    expect(settlement.completeRefund).toHaveBeenCalledWith(done.id, 'R-1', null)
    expect(settlement.fallBackToManualRefund).toHaveBeenCalledWith(refused.id, 'DEPOSIT_TOO_OLD')
  })

  // --- Règlements d'abonnement ---

  it('un règlement d\'abonnement abouti chez PawaPay est appliqué', async () => {
    const { profile } = await trainer()
    const txId = crypto.randomUUID()
    await prisma.subscriptionPayment.create({
      data: { trainerId: profile.id, amountFcfa: 5000, chargeIds: [], provider: 'PAWAPAY', providerTransactionId: txId },
    })
    pawapay.checkDeposit.mockResolvedValue(snapshot('COMPLETED', { depositId: txId }))

    const result = await reconcileProviderStates(later())

    expect(result.subscriptionPayments.settled).toBe(1)
    expect(settlement.settleSubscriptionPayment).toHaveBeenCalledWith(txId, 'PAWAPAY')
  })
})
