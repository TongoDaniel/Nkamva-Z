// ==========================================================================
// Jobs de cohérence des portefeuilles
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { openDispute, TRAINER_SHARE_RATE } from '@/lib/disputes'
import { resolveDispute } from '@/lib/dispute-review'
import {
  reconcileWallets,
  alertNegativeWallets,
  WALLET_NEGATIVE_ALERT_DAYS,
} from '@/lib/jobs/wallet-consistency'
import { JOBS, runJob } from '@/lib/jobs'

const DAY = 86_400_000
const AMOUNT = 20_000
const RESERVED = Math.round(AMOUNT * TRAINER_SHARE_RATE)

describe('Job — cohérence des portefeuilles', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function makeTrainer(balance = RESERVED) {
    const user = await prisma.user.create({
      data: { email: `t-${crypto.randomUUID()}@test.com`, fullName: 'Aminata Sow', role: 'TRAINER' },
    })
    const trainer = await prisma.trainerProfile.create({ data: { userId: user.id } })
    const wallet = await prisma.wallet.create({ data: { trainerId: trainer.id, balance } })
    return { user, trainer, wallet }
  }

  /** Un litige ouvert, donc une réservation ACTIVE de 17 000. */
  async function makeDispute(trainerId: string) {
    const learner = await prisma.user.create({ data: { email: `l-${crypto.randomUUID()}@test.com` } })
    const course = await prisma.course.create({
      data: {
        trainerId, slug: `c-${crypto.randomUUID()}`, title: 'Masterclass DDD',
        blurb: 'Accroche', description: 'Description', category: 'Développement', format: 'video',
        priceFcfa: AMOUNT, status: 'published', publishedAt: new Date(), durationSeconds: 3600,
      },
    })
    const purchase = await prisma.purchase.create({
      data: {
        learnerId: learner.id, trainerId, courseId: course.id,
        amountFcfa: AMOUNT, commissionRate: 0.15, trainerShareFcfa: RESERVED,
        platformShareFcfa: AMOUNT - RESERVED, provider: 'CINETPAY',
        providerTransactionId: `cp_${crypto.randomUUID()}`, providerStatus: 'SUCCEEDED',
        createdAt: new Date(Date.now() - 2 * DAY),
      },
    })
    const dispute = await openDispute(learner.id, {
      purchaseId: purchase.id,
      reason: 'CONTENT_MISMATCH',
      reasonDetail: 'Le contenu ne correspond pas à la fiche produit.',
    })
    return { learner, purchase, dispute }
  }

  const wallet = (id: string) => prisma.wallet.findUnique({ where: { id } })

  // --- Recalcul ---

  it('ne touche à rien quand tout concorde', async () => {
    const { trainer, wallet: w } = await makeTrainer()
    await makeDispute(trainer.id)

    const result = await reconcileWallets()
    expect(result).toMatchObject({ checked: 1, drifted: 0, corrections: 0 })
    expect((await wallet(w.id))!.reservedBalance).toBe(RESERVED)
    expect(await prisma.walletReconciliation.count()).toBe(0)
  })

  it('corrige une réserve gonflée et garde la trace de l’écart', async () => {
    const { trainer, wallet: w } = await makeTrainer()
    await makeDispute(trainer.id)
    // Simule un chemin de code ayant gelé deux fois.
    await prisma.wallet.update({ where: { id: w.id }, data: { reservedBalance: RESERVED * 2 } })

    const result = await reconcileWallets()
    expect(result).toMatchObject({ checked: 1, drifted: 1, corrections: 1 })
    expect((await wallet(w.id))!.reservedBalance).toBe(RESERVED)

    const record = await prisma.walletReconciliation.findFirst({ where: { walletId: w.id } })
    expect(record).toMatchObject({
      field: 'reservedBalance',
      previousValue: RESERVED * 2,
      newValue: RESERVED,
      delta: -RESERVED,
    })
    expect(
      await prisma.auditLog.count({ where: { action: 'WALLET_RECONCILED', targetId: w.id } }),
    ).toBe(1)
  })

  it('corrige une réserve oubliée après libération', async () => {
    const { trainer, wallet: w } = await makeTrainer()
    const { dispute } = await makeDispute(trainer.id)
    // La réservation est libérée sans que le portefeuille suive.
    await prisma.fundReservation.updateMany({
      where: { disputeId: dispute.id },
      data: { status: 'RELEASED', releasedAmount: RESERVED, releasedAt: new Date() },
    })

    expect(await reconcileWallets()).toMatchObject({ drifted: 1 })
    expect((await wallet(w.id))!.reservedBalance).toBe(0)
  })

  it('ne touche jamais au solde, même s’il paraît incohérent', async () => {
    const { trainer, wallet: w } = await makeTrainer(999)
    await makeDispute(trainer.id)
    await prisma.wallet.update({ where: { id: w.id }, data: { reservedBalance: 0 } })

    await reconcileWallets()

    // `balance` est le registre : rien ne permet de le recalculer, le corriger
    // masquerait le défaut au lieu de le révéler.
    expect((await wallet(w.id))!.balance).toBe(999)
    expect(await prisma.walletReconciliation.count({ where: { field: 'balance' } })).toBe(0)
  })

  it('corrige aussi les retraits en cours', async () => {
    const { wallet: w } = await makeTrainer()
    // Aucun retrait n'existe : la valeur attendue est zéro.
    await prisma.wallet.update({ where: { id: w.id }, data: { pendingPayoutBalance: 5000 } })

    const result = await reconcileWallets()
    expect(result.corrections).toBe(1)
    expect((await wallet(w.id))!.pendingPayoutBalance).toBe(0)
    expect(
      await prisma.walletReconciliation.count({ where: { field: 'pendingPayoutBalance' } }),
    ).toBe(1)
  })

  it('enregistre un écart par champ concerné', async () => {
    const { wallet: w } = await makeTrainer()
    await prisma.wallet.update({
      where: { id: w.id },
      data: { reservedBalance: 4000, pendingPayoutBalance: 5000 },
    })

    expect(await reconcileWallets()).toMatchObject({ drifted: 1, corrections: 2 })
    expect(await prisma.walletReconciliation.count({ where: { walletId: w.id } })).toBe(2)
  })

  it('prévient les finances, jamais la modération', async () => {
    const finance = await prisma.user.create({
      data: { email: 'fin@test.com', role: 'ADMIN', adminRole: 'FINANCES' },
    })
    const moderator = await prisma.user.create({
      data: { email: 'mod@test.com', role: 'ADMIN', adminRole: 'MODERATION' },
    })
    const { wallet: w } = await makeTrainer()
    await prisma.wallet.update({ where: { id: w.id }, data: { reservedBalance: 1234 } })

    await reconcileWallets()

    expect(await prisma.notification.count({ where: { userId: finance.id } })).toBe(1)
    expect(await prisma.notification.count({ where: { userId: moderator.id } })).toBe(0)
  })

  it('est idempotent : une seconde passe ne trouve plus rien', async () => {
    const { wallet: w } = await makeTrainer()
    await prisma.wallet.update({ where: { id: w.id }, data: { reservedBalance: 7777 } })

    expect((await reconcileWallets()).drifted).toBe(1)
    expect(await reconcileWallets()).toMatchObject({ drifted: 0, corrections: 0 })
    expect(await prisma.walletReconciliation.count()).toBe(1)
  })

  it('confirme l’invariant après un cycle complet de litige', async () => {
    const { trainer, wallet: w } = await makeTrainer()
    const admin = await prisma.user.create({
      data: { email: 'a@test.com', role: 'ADMIN', adminRole: 'MODERATION' },
    })
    const { dispute } = await makeDispute(trainer.id)
    const fresh = (await prisma.dispute.findUnique({ where: { id: dispute.id } }))!

    await resolveDispute(dispute.id, admin.id, false, {
      expectedUpdatedAt: fresh.updatedAt.toISOString(),
      resolution: 'REJECT',
      note: 'La ressource correspond à la description publiée.',
    })

    // Le rejet a libéré les fonds : le recalcul ne doit rien avoir à corriger.
    expect(await reconcileWallets()).toMatchObject({ drifted: 0 })
    expect((await wallet(w.id))!.reservedBalance).toBe(0)
  })

  // --- Solde négatif ---

  it('date le passage sous zéro', async () => {
    const { wallet: w } = await makeTrainer(-5000)

    const result = await alertNegativeWallets()
    expect(result).toMatchObject({ negative: 1, newlyNegative: 1, alerted: 0 })

    const after = await wallet(w.id)
    expect(after!.negativeSince).not.toBeNull()
    expect(
      await prisma.auditLog.count({ where: { action: 'WALLET_BALANCE_NEGATIVE', targetId: w.id } }),
    ).toBe(1)
  })

  it('ne redate pas un solde déjà négatif', async () => {
    const { wallet: w } = await makeTrainer(-5000)
    await alertNegativeWallets()
    const first = (await wallet(w.id))!.negativeSince

    await alertNegativeWallets()
    expect((await wallet(w.id))!.negativeSince!.getTime()).toBe(first!.getTime())
  })

  it('n’alerte pas avant le seuil', async () => {
    const { wallet: w } = await makeTrainer(-5000)
    await prisma.wallet.update({
      where: { id: w.id },
      data: { negativeSince: new Date(Date.now() - (WALLET_NEGATIVE_ALERT_DAYS - 1) * DAY) },
    })

    expect(await alertNegativeWallets()).toMatchObject({ alerted: 0 })
  })

  it('alerte les finances au-delà du seuil', async () => {
    const finance = await prisma.user.create({
      data: { email: 'fin2@test.com', role: 'ADMIN', adminRole: 'FINANCES' },
    })
    const { wallet: w } = await makeTrainer(-5000)
    await prisma.wallet.update({
      where: { id: w.id },
      data: { negativeSince: new Date(Date.now() - (WALLET_NEGATIVE_ALERT_DAYS + 3) * DAY) },
    })

    const result = await alertNegativeWallets()
    expect(result).toMatchObject({ alerted: 1 })
    expect(await prisma.notification.count({ where: { userId: finance.id, type: 'WALLET_NEGATIVE_TOO_LONG' } })).toBe(1)

    const log = await prisma.auditLog.findFirst({
      where: { action: 'WALLET_NEGATIVE_TOO_LONG', targetId: w.id },
    })
    expect(log!.meta).toMatchObject({ balance: -5000 })
  })

  it('remet le compteur à zéro quand le solde repasse au vert', async () => {
    const { wallet: w } = await makeTrainer(-5000)
    await alertNegativeWallets()
    expect((await wallet(w.id))!.negativeSince).not.toBeNull()

    // Une vente remet le formateur à l'équilibre.
    await prisma.wallet.update({ where: { id: w.id }, data: { balance: 12000 } })

    const result = await alertNegativeWallets()
    expect(result).toMatchObject({ recovered: 1, negative: 0 })
    expect((await wallet(w.id))!.negativeSince).toBeNull()
    expect(
      await prisma.auditLog.count({ where: { action: 'WALLET_BALANCE_RECOVERED', targetId: w.id } }),
    ).toBe(1)
  })

  it('ignore les portefeuilles sains', async () => {
    await makeTrainer(30000)
    expect(await alertNegativeWallets()).toMatchObject({ negative: 0, newlyNegative: 0, alerted: 0 })
  })

  // --- Ordonnanceur ---

  it('les deux tâches journalisent leur issue', async () => {
    const { wallet: w } = await makeTrainer(-1000)
    await prisma.wallet.update({ where: { id: w.id }, data: { reservedBalance: 42 } })

    for (const id of ['reconcile-wallets', 'alert-negative-wallets']) {
      await runJob(JOBS.find((j) => j.id === id)!)
      const log = await prisma.auditLog.findFirst({
        where: { action: 'SCHEDULED_JOB_COMPLETED', targetId: id },
      })
      expect(log).not.toBeNull()
    }

    expect((await wallet(w.id))!.reservedBalance).toBe(0)
    expect((await wallet(w.id))!.negativeSince).not.toBeNull()
  })
})
