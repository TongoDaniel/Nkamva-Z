// Lot 0/2 — Client Stripe partagé (webhooks paiement, chargebacks, refunds)
import Stripe from 'stripe'

let client: Stripe | null = null
let clientKey: string | null = null

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

// Le client est mémoïsé par clé : les tests basculent STRIPE_SECRET_KEY à chaud
// pour exercer les deux chemins (configuré / dev sans clé).
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  if (!client || clientKey !== key) {
    client = new Stripe(key)
    clientKey = key
  }
  return client
}
