// ==========================================================================
// Fiche client du service client : plan d'action, action 0.13
// ==========================================================================
// Le service client doit régler un « j'ai payé mais je n'ai pas accès » depuis
// un seul écran : le compte, les achats (avec leur état chez le fournisseur et
// l'accès qui en découle), les paiements, les litiges et les échanges.
//
// Lecture seule, à une exception près, voulue : relancer le rapprochement d'un
// achat resté en attente (`reconcilePurchase`). Ce geste ne crée aucun argent :
// il redemande son statut au fournisseur, qui reste seul juge. C'est
// exactement ce que fait l'écran de confirmation de l'acheteur, et c'est le cas
// le plus fréquent d'accès « payé mais fermé » (callback perdu).
//
// Ce que la fiche ne fait pas : valider un remboursement ou un retrait
// (Finances), ni sanctionner (Modération).
// ==========================================================================

import { db } from './db'
import { auditStandalone } from './audit'
import { reconcilePurchase } from './purchases'

export async function findCustomers(query: string) {
  const q = query.trim()
  if (q.length < 2) return []
  const digits = q.replace(/\D/g, '')
  return db.user.findMany({
    where: {
      deletedAt: null,
      role: { not: 'ADMIN' },
      OR: [
        { email: { contains: q, mode: 'insensitive' } },
        { fullName: { contains: q, mode: 'insensitive' } },
        ...(digits.length >= 6 ? [{ phone: { contains: digits } }] : []),
        ...(/^[0-9a-f-]{36}$/i.test(q) ? [{ id: q }] : []),
      ],
    },
    select: { id: true, email: true, fullName: true, role: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
}

/** Ce que l'accès d'un achat est, en clair, pour qui répond au client. */
export function accessVerdict(p: {
  providerStatus: string
  refundedAt: Date | null
  accessSuspended: boolean
  providerDisputeActive: boolean
}): { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted'; hint: string } {
  if (p.refundedAt) return { label: 'Remboursé', tone: 'muted', hint: 'Accès retiré après remboursement.' }
  if (p.providerStatus === 'PENDING') {
    return {
      label: 'Paiement en attente',
      tone: 'warn',
      hint: "Le fournisseur n'a pas encore confirmé. Relancez le rapprochement : si l'argent est encaissé, l'accès s'ouvre aussitôt.",
    }
  }
  if (p.providerStatus === 'FAILED' || p.providerStatus === 'CANCELED') {
    return { label: 'Paiement échoué', tone: 'bad', hint: "Aucun argent encaissé : l'acheteur peut payer à nouveau." }
  }
  if (p.accessSuspended || p.providerDisputeActive) {
    return { label: 'Accès suspendu', tone: 'warn', hint: 'Un litige est en cours sur cet achat : l’accès revient si la contestation est écartée.' }
  }
  return { label: 'Accès ouvert', tone: 'ok', hint: "L'achat est réglé et l'accès est ouvert." }
}

export async function getCustomerCard(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, fullName: true, phone: true, countryCode: true, role: true,
      emailVerifiedAt: true, createdAt: true, suspendedAt: true, deletedAt: true,
      trainerProfile: { select: { id: true, plan: true, founder: true, commissionRate: true, inactivityArchivedAt: true } },
    },
  })
  if (!user || user.role === 'ADMIN') return null

  const [purchases, disputes, invoices] = await Promise.all([
    db.purchase.findMany({
      where: { learnerId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, createdAt: true, amountFcfa: true, buyerFeeFcfa: true, provider: true,
        providerStatus: true, providerTransactionId: true, failureCode: true,
        refundedAt: true, refundAmountFcfa: true, accessSuspended: true, providerDisputeActive: true,
        course: { select: { title: true, slug: true } },
        community: { select: { name: true, slug: true } },
      },
    }),
    db.dispute.findMany({
      where: { learnerId: userId },
      orderBy: { openedAt: 'desc' },
      take: 20,
      select: {
        id: true, status: true, reason: true, openedAt: true, disputedAmountFcfa: true,
        resolution: true, refundStatus: true, abuseReview: true, proposedResolution: true,
        purchase: { select: { course: { select: { title: true } }, community: { select: { name: true } } } },
      },
    }),
    db.invoice.findMany({
      where: { userId },
      orderBy: { issuedAt: 'desc' },
      take: 20,
      select: { id: true, number: true, label: true, amountFcfa: true, feeFcfa: true, issuedAt: true },
    }),
  ])

  return {
    user,
    purchases: purchases.map((p) => ({ ...p, access: accessVerdict(p), totalPaidFcfa: p.amountFcfa + p.buyerFeeFcfa })),
    disputes,
    invoices,
  }
}

/**
 * « J'ai payé mais je n'ai pas accès » : on redemande son statut au
 * fournisseur. Rien n'est crédité sans sa confirmation.
 */
export async function recheckPurchase(purchaseId: string, actorId: string) {
  const purchase = await db.purchase.findUnique({
    where: { id: purchaseId },
    select: { id: true, providerTransactionId: true, providerStatus: true },
  })
  if (!purchase) throw new Error('PURCHASE_NOT_FOUND')
  if (!purchase.providerTransactionId) throw new Error('MISSING_TRANSACTION_ID')

  const result = await reconcilePurchase(purchase.providerTransactionId)
  await auditStandalone({
    actorId, actorRole: 'SUPPORT',
    action: 'SUPPORT_PURCHASE_RECHECKED', targetType: 'Purchase', targetId: purchaseId,
    meta: { before: purchase.providerStatus, after: result.status, credited: result.credited },
  })
  return result
}
