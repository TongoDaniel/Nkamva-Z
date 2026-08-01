// Lot 0 §5.1 / Lot 2 §3.3 — Webhook Stripe
//
// Deux familles d'événements :
//   payment_intent.succeeded         → crédit du portefeuille (idempotent)
//   charge.dispute.created / .closed → ouverture et clôture d'un litige
//
// Un chargeback n'est pas une demande mais une décision prise ailleurs : les
// contrôles de recevabilité (14 jours, 30 %) ne s'y appliquent pas.
import Stripe from 'stripe'
import { db } from '@/lib/db'
import { creditWalletOnPurchase } from '@/lib/wallet'
import { auditStandalone } from '@/lib/audit'
import { openChargebackDispute, closeChargebackDispute } from '@/lib/chargebacks'

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null

interface StripeDisputeObject {
  charge?: string
  payment_intent?: string
  status?: string
}

type StripeLikeEvent = {
  id?: string
  type: string
  data: { object: { id: string } & StripeDisputeObject }
}

/**
 * Transmet à Stripe la preuve que l'achat a déjà été remboursé.
 * Sans cela, la banque prélèverait une seconde fois, et c'est le formateur qui
 * en ferait les frais pour un remboursement qu'il a déjà supporté.
 */
async function submitAlreadyRefundedEvidence(providerDisputeId: string, purchaseId: string) {
  if (!stripe) return
  try {
    await stripe.disputes.update(providerDisputeId, {
      evidence: {
        uncategorized_text: `Remboursement déjà effectué par le marchand pour l'achat ${purchaseId}. Aucun montant supplémentaire n'est dû.`,
      },
    })
    await auditStandalone({
      actorRole: 'SYSTEM',
      action: 'CHARGEBACK_EVIDENCE_SUBMITTED',
      targetType: 'Purchase',
      targetId: purchaseId,
      meta: { providerDisputeId },
    })
  } catch (err) {
    // Un échec de soumission ne doit pas faire échouer le webhook : Stripe
    // rejouerait l'événement et repasserait sur le même dossier.
    console.error('[STRIPE:EVIDENCE_ERROR]', { providerDisputeId, error: String(err) })
    await auditStandalone({
      actorRole: 'SYSTEM',
      action: 'CHARGEBACK_EVIDENCE_SUBMIT_FAILED',
      targetType: 'Purchase',
      targetId: purchaseId,
      meta: { providerDisputeId, error: String(err) },
    })
  }
}

/** Retrouve l'achat visé : Stripe référence le PaymentIntent ou la charge. */
async function resolveTransactionId(object: StripeDisputeObject): Promise<string | null> {
  if (object.payment_intent) return object.payment_intent
  if (!object.charge || !stripe) return null
  try {
    const charge = await stripe.charges.retrieve(object.charge)
    return typeof charge.payment_intent === 'string' ? charge.payment_intent : null
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')

  let event: StripeLikeEvent

  if (stripe && process.env.STRIPE_WEBHOOK_SECRET) {
    if (!signature) return new Response('Missing signature', { status: 400 })
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET) as unknown as StripeLikeEvent
    } catch {
      return new Response('Invalid signature', { status: 400 })
    }
  } else {
    // Dev sans STRIPE_WEBHOOK_SECRET : la signature ne peut pas être vérifiée.
    // Ce chemin n'est emprunté que par la simulation dev de initiatePurchase
    // (jamais par un vrai appel Stripe, qui exige toujours une signature en prod).
    try {
      event = JSON.parse(rawBody)
    } catch {
      return new Response('Invalid payload', { status: 400 })
    }
  }

  const object = event.data.object

  if (event.type === 'payment_intent.succeeded') {
    await db.$transaction(async (tx) => {
      await creditWalletOnPurchase(tx, object.id, 'STRIPE')
    })
    return new Response(null, { status: 200 })
  }

  if (event.type === 'charge.dispute.created') {
    const providerTransactionId = await resolveTransactionId(object)
    if (!providerTransactionId) {
      await auditStandalone({
        actorRole: 'SYSTEM',
        action: 'CHARGEBACK_TRANSACTION_UNRESOLVED',
        meta: { providerDisputeId: object.id },
      })
      // 200 malgré tout : rejouer n'y changerait rien, l'événement ne permet
      // pas de retrouver l'achat.
      return new Response(null, { status: 200 })
    }

    // Le montant du litige n'est pas repris de Stripe : `amount` y est exprimé
    // dans la plus petite unité de la devise du paiement — des centimes pour
    // l'euro. Le prendre pour des FCFA fausserait le gel d'un facteur cent. On
    // s'en tient au montant de l'achat, tenu en FCFA par nos soins.
    const result = await openChargebackDispute({
      providerTransactionId,
      providerDisputeId: object.id,
      source: 'STRIPE_CHARGEBACK',
    })

    if (result.doubleDebitPrevented) {
      const purchase = await db.purchase.findUnique({
        where: { providerTransactionId },
        select: { id: true },
      })
      if (purchase) await submitAlreadyRefundedEvidence(object.id, purchase.id)
    }

    return new Response(null, { status: 200 })
  }

  if (event.type === 'charge.dispute.closed') {
    // `status` porte l'issue : `lost` ou `won`. Toute autre clôture (par
    // exemple `warning_closed`) ne tranche rien et n'a pas à fermer le dossier.
    const status = object.status
    if (status !== 'lost' && status !== 'won') {
      await auditStandalone({
        actorRole: 'SYSTEM',
        action: 'CHARGEBACK_CLOSED_WITHOUT_OUTCOME',
        meta: { providerDisputeId: object.id, status: status ?? null },
      })
      return new Response(null, { status: 200 })
    }

    await closeChargebackDispute({
      providerDisputeId: object.id,
      outcome: status === 'lost' ? 'LOST' : 'WON',
    })
    return new Response(null, { status: 200 })
  }

  await auditStandalone({ action: 'STRIPE_WEBHOOK_EVENT_IGNORED', meta: { type: event.type } })
  return new Response(null, { status: 200 })
}
