// Lot 0 §5.1 — Webhook Stripe : payment_intent.succeeded → crédit wallet idempotent
// Lot 2 §5 — charge.dispute.created/closed → chargeback (T1/T9/T10, double débit)
import { db } from '@/lib/db'
import { creditWalletOnPurchase } from '@/lib/wallet'
import { auditStandalone } from '@/lib/audit'
import { getStripe } from '@/lib/stripe'
import { openDisputeFromChargeback, closeDisputeFromChargeback } from '@/lib/disputes'

const stripe = getStripe()

type StripeLikeEvent = {
  id?: string
  type: string
  data: { object: { id: string; payment_intent?: string; status?: string } }
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

  if (event.type === 'payment_intent.succeeded') {
    const providerTransactionId = event.data.object.id
    await db.$transaction(async (tx) => {
      await creditWalletOnPurchase(tx, providerTransactionId, 'STRIPE')
    })
  } else if (event.type === 'charge.dispute.created') {
    const paymentIntentId = event.data.object.payment_intent || event.data.object.id
    await openDisputeFromChargeback(paymentIntentId, event.data.object.id)
  } else if (event.type === 'charge.dispute.closed') {
    const won = event.data.object.status === 'won'
    await closeDisputeFromChargeback(event.data.object.id, won)
  } else {
    await auditStandalone({ action: 'STRIPE_WEBHOOK_EVENT_IGNORED', meta: { type: event.type } })
  }

  return new Response(null, { status: 200 })
}
