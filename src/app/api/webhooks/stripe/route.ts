// Lot 0 §5.1 — Webhook Stripe : payment_intent.succeeded → crédit wallet idempotent
import Stripe from 'stripe'
import { db } from '@/lib/db'
import { creditWalletOnPurchase } from '@/lib/wallet'
import { auditStandalone } from '@/lib/audit'

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null

// Événement minimal exploité ici (payment_intent.succeeded). Les événements de
// litige (charge.dispute.created/closed) relèvent du Lot 2, hors périmètre.
type StripeLikeEvent = { id?: string; type: string; data: { object: { id: string } } }

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
  } else {
    await auditStandalone({ action: 'STRIPE_WEBHOOK_EVENT_IGNORED', meta: { type: event.type } })
  }

  return new Response(null, { status: 200 })
}
