// Arbitrage 11 — règlement d'une échéance d'abonnement par le formateur.
//
// Jusqu'ici, le seul geste qui levait un impayé était le « Constater » de
// Finances : le formateur recevait un avis « votre abonnement est à régler »
// sans aucun bouton pour le régler.
import { z } from 'zod'
import { success, error, requireTrainer, parseBody, domainErrorResponse } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { MobileMoneyPayerSchema } from '@/lib/payment-input'
import { db } from '@/lib/db'
import {
  getSubscriptionPaymentState, initiateSubscriptionPayment, openReactivationCharge,
} from '@/lib/subscription-payment'

const InitiateSchema = z.object({
  provider: z.enum(['STRIPE', 'PAWAPAY']),
  /**
   * Numéro et opérateur mobile money. Obligatoire pour PawaPay, qui adresse un
   * téléphone et non un compte ; ignoré pour Stripe. **Rien n'est mémorisé**
   * (arbitrage 16) : il est ressaisi à chaque règlement.
   */
  payer: MobileMoneyPayerSchema.optional(),
})

/** Ce qu'il reste à régler, ou 404 s'il n'y a rien à payer. */
export async function GET() {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx

  const state = await getSubscriptionPaymentState(ctx.user.trainerId!)
  if (!state) return error('NOTHING_TO_PAY', 'Aucune échéance à régler', 404)
  return success(state)
}

export async function POST(request: Request) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx

  // Même plafond que l'achat : abandonner un paiement puis le reprendre est
  // normal, mais une boucle côté client ne doit pas fabriquer des dizaines
  // d'intentions facturées chez le fournisseur.
  const limit = checkRateLimit(
    getRateLimitIdentifier(ctx.user, request), 'PURCHASE_INITIATE',
    RATE_LIMITS.PURCHASE_INITIATE.max, RATE_LIMITS.PURCHASE_INITIATE.windowMs,
  )
  if (!limit.allowed) {
    return error('RATE_LIMITED', 'Trop de tentatives de paiement, réessayez dans quelques minutes', 429)
  }

  const parsed = await parseBody(request, InitiateSchema)
  if (parsed instanceof Response) return parsed

  try {
    // Arbitrage 7 — un ancien formateur qui revient n'a aucune échéance en
    // attente : il faut lui en ouvrir une avant de pouvoir la lui faire régler.
    // L'appel est sans effet pour un formateur en activité.
    const profile = await db.trainerProfile.findUnique({
      where: { id: ctx.user.trainerId! },
      select: { subscriptionStatus: true },
    })
    if (profile?.subscriptionStatus === 'CANCELED') {
      await openReactivationCharge(ctx.user.trainerId!)
    }

    return success(
      await initiateSubscriptionPayment(
        ctx.user.trainerId!, ctx.user.id, parsed.data.provider, parsed.data.payer,
      ),
      {},
      201,
    )
  } catch (err) {
    const code = err instanceof Error ? err.message : ''
    if (code === 'PAYMENT_IN_PROGRESS') {
      return error(
        'PAYMENT_IN_PROGRESS',
        "Un paiement est déjà en cours. Terminez-le, ou attendez qu'il expire avant d'en changer.",
        409,
      )
    }
    // Réglée entre-temps : un prélèvement sur solde a pu passer dans la nuit.
    // Ce n'est pas une panne, l'écran n'a qu'à se relire.
    if (code === 'NOTHING_TO_PAY') {
      return error('NOTHING_TO_PAY', 'Aucune échéance à régler : votre abonnement est à jour.', 409)
    }
    if (code === 'PAYMENT_PROVIDER_UNAVAILABLE') {
      return error(
        'PAYMENT_PROVIDER_UNAVAILABLE',
        "Le moyen de paiement choisi n'est pas disponible pour le moment.",
        503,
      )
    }
    if (code === 'MOBILE_MONEY_DETAILS_REQUIRED') {
      return error('MOBILE_MONEY_DETAILS_REQUIRED', 'Renseignez votre numéro mobile money.', 422)
    }
    if (code === 'PROVIDER_NOT_SUPPORTED') {
      return error('PROVIDER_NOT_SUPPORTED', "Cet opérateur n'est pas pris en charge.", 422)
    }
    const translated = domainErrorResponse(err)
    if (translated) return translated
    console.error('[API:SUBSCRIPTION_PAYMENT]', err)
    return error('INTERNAL_ERROR', 'Erreur', 500)
  }
}
