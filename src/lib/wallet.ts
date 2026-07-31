import { db } from './db'
import { audit } from './audit'
import type { PrismaTransaction } from './types'

export interface CreditWalletOnPurchaseResult { credited: boolean; purchaseId: string | null; trainerId: string | null; amountFcfa: number; trainerShareFcfa: number }

export async function creditWalletOnPurchase(tx: PrismaTransaction, providerTransactionId: string, provider: 'STRIPE' | 'CINETPAY'): Promise<CreditWalletOnPurchaseResult> {
  const result = await tx.purchase.updateMany({ where: { providerTransactionId, providerStatus: 'PENDING' }, data: { providerStatus: 'SUCCEEDED' } })
  if (result.count === 0) {
    await audit(tx, { action: 'WEBHOOK_DUPLICATE_IGNORED', meta: { provider, providerTransactionId, reason: 'purchase_already_succeeded_or_not_found' } })
    return { credited: false, purchaseId: null, trainerId: null, amountFcfa: 0, trainerShareFcfa: 0 }
  }
  const purchase = await tx.purchase.findUnique({ where: { providerTransactionId }, select: { id: true, trainerId: true, amountFcfa: true, trainerShareFcfa: true, platformShareFcfa: true, learnerId: true } })
  if (!purchase) return { credited: false, purchaseId: null, trainerId: null, amountFcfa: 0, trainerShareFcfa: 0 }
  const walletExisted = await tx.wallet.findUnique({ where: { trainerId: purchase.trainerId }, select: { id: true } })
  await tx.wallet.upsert({ where: { trainerId: purchase.trainerId }, update: { balance: { increment: purchase.trainerShareFcfa } }, create: { trainerId: purchase.trainerId, balance: purchase.trainerShareFcfa } })
  await audit(tx, { action: 'PURCHASE_SUCCEEDED', targetType: 'Purchase', targetId: purchase.id, meta: { providerTransactionId, provider, amountFcfa: purchase.amountFcfa, trainerShareFcfa: purchase.trainerShareFcfa, platformShareFcfa: purchase.platformShareFcfa, trainerId: purchase.trainerId, learnerId: purchase.learnerId, walletAutoCreated: !walletExisted } })
  if (!walletExisted) await audit(tx, { action: 'WALLET_AUTO_CREATED', targetType: 'Wallet', targetId: purchase.trainerId, meta: { trainerId: purchase.trainerId, reason: 'wallet_missing_on_purchase_success', providerTransactionId } })
  return { credited: true, purchaseId: purchase.id, trainerId: purchase.trainerId, amountFcfa: purchase.amountFcfa, trainerShareFcfa: purchase.trainerShareFcfa }
}
