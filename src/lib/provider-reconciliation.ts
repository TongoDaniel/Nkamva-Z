// ==========================================================================
// Rapprochement avec les fournisseurs de paiement — campagne du 12 octobre
// 2026, M1
// ==========================================================================
// Les retraits, les remboursements et les règlements d'abonnement ne
// dépendaient que du rappel PawaPay ou Stripe. Un rappel perdu — systématique
// en local, possible en staging — laissait NKAMVA diverger du fournisseur pour
// toujours :
//
//   · un retrait `COMPLETED` chez PawaPay restait `APPROVED`, bloquait tout
//     nouveau retrait (`PAYOUT_IN_PROGRESS`) et tout changement de moyen ;
//   · un remboursement `COMPLETED` restait `PENDING` : la réserve du litige
//     n'était jamais libérée ni débitée, le solde ne revenait jamais à zéro, et
//     la formatrice ne pouvait plus supprimer son compte ;
//   · un règlement d'abonnement `COMPLETED` laissait la formatrice suspendue.
//
// Ce module redemande l'état au fournisseur et applique **exactement** ce
// qu'aurait appliqué le rappel : il appelle les mêmes fonctions que les routes
// `/api/webhooks/pawapay/*`. Toutes sont idempotentes ; un rappel qui arrive
// après le rattrapage, ou l'inverse, ne fait rien de plus.
//
// Ne lève jamais : un fournisseur injoignable ou une ligne inattendue ne doit
// pas empêcher de traiter les suivantes. Chaque écart est journalisé.
// ==========================================================================

import { db } from './db'
import { auditStandalone } from './audit'
import { checkPayout, checkRefund, isPawaPayConfigured, type TransactionSnapshot } from './pawapay'
import { markPayoutFailed, markPayoutPaid } from './payouts'
import { completeRefund, fallBackToManualRefund } from './disputes'
import { failSubscriptionPayment, settleSubscriptionPayment } from './subscription-payment'
import { providerSaysSettled, reconcilePurchase } from './purchases'

/**
 * Délai laissé au rappel avant de s'en passer. Le fournisseur rappelle en
 * quelques secondes quand tout va bien ; au-delà de quinze minutes, c'est qu'il
 * ne viendra pas.
 */
export const RECONCILE_AFTER_MS = 15 * 60_000

/**
 * Au-delà, une ligne en attente n'est plus rapprochée automatiquement : elle
 * relève de Finances, qui a le contexte pour trancher. Sans borne, le job
 * réinterrogerait chaque nuit des transactions de l'an passé.
 */
export const RECONCILE_MAX_AGE_MS = 30 * 86_400_000

export interface ProviderReconciliationResult {
  payouts: { checked: number; paid: number; failed: number }
  refunds: { checked: number; completed: number; failed: number }
  subscriptionPayments: { checked: number; settled: number; failed: number }
  purchases: { checked: number; settled: number }
  errors: number
}

function failureReason(snapshot: TransactionSnapshot, fallback: string): string {
  return snapshot.failureReason?.failureMessage || snapshot.failureReason?.failureCode || fallback
}

async function noteError(kind: string, targetType: string, targetId: string, err: unknown) {
  await auditStandalone({
    action: 'PROVIDER_RECONCILE_ERROR', targetType, targetId,
    meta: { kind, error: err instanceof Error ? err.message : String(err) },
  })
}

export async function reconcileProviderStates(now = new Date()): Promise<ProviderReconciliationResult> {
  const result: ProviderReconciliationResult = {
    payouts: { checked: 0, paid: 0, failed: 0 },
    refunds: { checked: 0, completed: 0, failed: 0 },
    subscriptionPayments: { checked: 0, settled: 0, failed: 0 },
    purchases: { checked: 0, settled: 0 },
    errors: 0,
  }
  const before = new Date(now.getTime() - RECONCILE_AFTER_MS)
  const after = new Date(now.getTime() - RECONCILE_MAX_AGE_MS)

  // --- Retraits mobile money partis chez PawaPay -------------------------
  // `Payout.id` est l'identifiant PawaPay (voir `dispatchPayout`). Un IBAN, lui,
  // se vire à la main : il n'y a rien à demander à personne.
  if (isPawaPayConfigured()) {
    const payouts = await db.payout.findMany({
      where: {
        status: { in: ['APPROVED', 'AUTO_APPROVED'] },
        wireInitiatedAt: { lte: before, gte: after },
        payoutMethod: { type: 'MOBILE_MONEY' },
      },
      select: { id: true },
    })
    for (const { id } of payouts) {
      result.payouts.checked += 1
      try {
        const snapshot = await checkPayout(id)
        if (snapshot?.status === 'COMPLETED') {
          await markPayoutPaid(id, {
            providerReference: snapshot.providerTransactionId ?? null, actorId: null, actorRole: 'SYSTEM',
          })
          result.payouts.paid += 1
        } else if (snapshot?.status === 'FAILED') {
          await markPayoutFailed(id, {
            reason: failureReason(snapshot, 'Échec du versement chez le fournisseur'),
            actorId: null, actorRole: 'SYSTEM',
          })
          result.payouts.failed += 1
        }
      } catch (err) {
        result.errors += 1
        await noteError('PAYOUT', 'Payout', id, err)
      }
    }

    // --- Remboursements de litiges partis chez PawaPay -------------------
    // `Dispute.id` est l'identifiant de remboursement PawaPay.
    const disputes = await db.dispute.findMany({
      where: {
        refundStatus: 'PENDING',
        updatedAt: { lte: before, gte: after },
        purchase: { provider: 'PAWAPAY' },
      },
      select: { id: true },
    })
    for (const { id } of disputes) {
      result.refunds.checked += 1
      try {
        const snapshot = await checkRefund(id)
        if (snapshot?.status === 'COMPLETED') {
          await completeRefund(id, snapshot.providerTransactionId ?? null, null)
          result.refunds.completed += 1
        } else if (snapshot?.status === 'FAILED') {
          await fallBackToManualRefund(id, failureReason(snapshot, 'PROVIDER_REFUND_FAILED'))
          result.refunds.failed += 1
        }
      } catch (err) {
        result.errors += 1
        await noteError('REFUND', 'Dispute', id, err)
      }
    }
  }

  // --- Règlements d'échéance d'abonnement formateur ----------------------
  const payments = await db.subscriptionPayment.findMany({
    where: {
      providerStatus: 'PENDING',
      providerTransactionId: { not: null },
      createdAt: { lte: before, gte: after },
    },
    select: { id: true, provider: true, providerTransactionId: true },
  })
  for (const payment of payments) {
    result.subscriptionPayments.checked += 1
    const txId = payment.providerTransactionId!
    try {
      const verdict = await providerSaysSettled(payment.provider, txId)
      if (verdict.outcome === 'COMPLETED') {
        const settled = await settleSubscriptionPayment(txId, payment.provider)
        if (settled.settled) result.subscriptionPayments.settled += 1
      } else if (verdict.outcome === 'FAILED') {
        if (await failSubscriptionPayment(txId, verdict.failureCode)) result.subscriptionPayments.failed += 1
      }
    } catch (err) {
      result.errors += 1
      await noteError('SUBSCRIPTION_PAYMENT', 'SubscriptionPayment', payment.id, err)
    }
  }

  // --- Achats et adhésions dont l'apprenant a quitté l'écran -------------
  // `reconcilePurchase` existait déjà, mais seul l'écran de confirmation
  // l'appelait : un apprenant qui fermait l'onglet pendant la confirmation
  // mobile money laissait son achat en attente jusqu'au rappel.
  const purchases = await db.purchase.findMany({
    where: {
      providerStatus: 'PENDING',
      providerTransactionId: { not: null },
      updatedAt: { lte: before, gte: after },
    },
    select: { id: true, providerTransactionId: true },
  })
  for (const purchase of purchases) {
    result.purchases.checked += 1
    try {
      const outcome = await reconcilePurchase(purchase.providerTransactionId!)
      if (outcome.status === 'SUCCEEDED' && outcome.credited) result.purchases.settled += 1
    } catch (err) {
      result.errors += 1
      await noteError('PURCHASE', 'Purchase', purchase.id, err)
    }
  }

  return result
}
