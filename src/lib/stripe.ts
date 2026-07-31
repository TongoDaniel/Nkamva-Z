import Stripe from 'stripe'

let client: Stripe | null | undefined

export function getStripe(): Stripe | null {
  if (client === undefined) client = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null
  return client
}
