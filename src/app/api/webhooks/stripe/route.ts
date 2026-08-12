// Lot 0 §5.1 — Webhook Stripe : le paiement abouti → crédit wallet idempotent
// Lot 2 — charge.dispute.created / charge.dispute.closed → machine à états litiges
import { db } from '@/lib/db'
import { creditWalletOnPurchase } from '@/lib/wallet'
import { auditStandalone } from '@/lib/audit'
import { getStripe } from '@/lib/stripe'
import { issueInvoiceQuietly } from '@/lib/invoices'
import { promoteCheckoutSession } from '@/lib/purchases'
import { promoteActivationCheckoutSession, settleActivationPayment } from '@/lib/trainer-activation'
import { promoteSubscriptionCheckoutSession, settleSubscriptionPayment } from '@/lib/subscription-payment'
import { openDisputeFromChargeback, closeChargeback } from '@/lib/disputes'

type StripeLikeEvent = {
  id?: string
  type: string
  data: {
    object: {
      id: string
      // Présents sur les événements charge.dispute.* et checkout.session.*
      payment_intent?: string | null
      payment_status?: string | null
      amount?: number | null
      status?: string | null
      reason?: string | null
    }
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')
  const stripe = getStripe()

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

  const object = event.data?.object
  if (!object?.id) return new Response('Invalid payload', { status: 400 })

  switch (event.type) {
    // Depuis le passage à Checkout, c'est cet événement qui annonce un paiement
    // par carte abouti. L'achat porte encore son `cs_…` : on le remplace par le
    // PaymentIntent avant de créditer, sans quoi le litige qui arriverait
    // ensuite — indexé sur `pi_…` — ne retrouverait aucun achat.
    case 'checkout.session.completed': {
      if (object.payment_status !== 'paid') break

      // Deux sujets peuvent se régler par Checkout depuis que le premier
      // abonnement d'un formateur se paie en ligne : un achat, ou l'activation
      // d'un espace formateur. La session ne dit pas lequel — on tente les deux
      // promotions, chacune ne reconnaissant que ses propres lignes.
      const activationIntent = await promoteActivationCheckoutSession(object.id)
      if (activationIntent) {
        await settleActivationPayment(activationIntent, 'STRIPE')
        break
      }

      // Troisième sujet depuis l'arbitrage 11 : le règlement d'une échéance
      // d'abonnement. Même partage que ci-dessus — chaque promotion ne
      // reconnaît que ses propres lignes.
      const subscriptionIntent = await promoteSubscriptionCheckoutSession(object.id)
      if (subscriptionIntent) {
        await settleSubscriptionPayment(subscriptionIntent, 'STRIPE')
        break
      }

      const intentId = await promoteCheckoutSession(object.id)
      if (!intentId) break
      const credit = await db.$transaction(async (tx) => {
        return creditWalletOnPurchase(tx, intentId, 'STRIPE')
      })
      if (credit.credited && credit.purchaseId) {
        await issueInvoiceQuietly(credit.purchaseId)
      }
      break
    }

    // Conservé : une session déjà promue laisse un achat indexé sur `pi_…`, et
    // cet événement le retrouve. Si le crédit a déjà eu lieu, l'écriture
    // idempotente de `creditWalletOnPurchase` n'en refait aucun.
    case 'payment_intent.succeeded': {
      // Même partage que ci-dessus. `settleActivationPayment` ne reconnaît que
      // ses propres identifiants et rend `settled: false` sur tous les autres,
      // ce qui laisse le chemin d'achat intact.
      const activation = await settleActivationPayment(object.id, 'STRIPE')
      if (activation.settled) break

      const subscription = await settleSubscriptionPayment(object.id, 'STRIPE')
      if (subscription.settled) break

      const credit = await db.$transaction(async (tx) => {
        return creditWalletOnPurchase(tx, object.id, 'STRIPE')
      })
      // La facture s'émet **après** le commit, et son échec ne renvoie pas
      // d'erreur au provider : un webhook en échec est rejoué, et l'accès de
      // l'apprenant ne doit pas dépendre d'une pièce comptable.
      if (credit.credited && credit.purchaseId) {
        await issueInvoiceQuietly(credit.purchaseId)
      }
      break
    }

    // T1 (source STRIPE_CHARGEBACK) — ou contestation automatique si la vente
    // a déjà été remboursée, pour ne jamais débiter deux fois (décision 17).
    case 'charge.dispute.created': {
      if (!object.payment_intent) {
        await auditStandalone({
          action: 'CHARGEBACK_WITHOUT_PAYMENT_INTENT', meta: { providerDisputeId: object.id },
        })
        break
      }
      // `object.amount` est exprimé dans la devise de la charge (centimes si
      // EUR) : on ne l'utilise pas comme montant FCFA. Le litige porte sur
      // Purchase.amountFcfa, seule source de vérité côté plateforme.
      await openDisputeFromChargeback({
        providerDisputeId: object.id,
        providerTransactionId: object.payment_intent,
      })
      break
    }

    // T9 (lost) / T10 (won)
    case 'charge.dispute.closed': {
      const outcome = object.status === 'lost' ? 'lost' : object.status === 'won' ? 'won' : null
      if (!outcome) {
        await auditStandalone({
          action: 'CHARGEBACK_CLOSED_IGNORED',
          meta: { providerDisputeId: object.id, status: object.status },
        })
        break
      }
      await closeChargeback(object.id, outcome)
      break
    }

    default:
      await auditStandalone({ action: 'STRIPE_WEBHOOK_EVENT_IGNORED', meta: { type: event.type } })
  }

  return new Response(null, { status: 200 })
}
