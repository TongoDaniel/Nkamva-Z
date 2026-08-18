// Règlement du premier abonnement — ouvre le paiement qui ouvrira l'espace.
import { z } from 'zod'
import { success, error, requireAuth, parseBody, domainErrorResponse } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { MobileMoneyPayerSchema } from '@/lib/payment-input'
import {
  getActivationState, initiateActivationPayment, reconcileActivationPayment,
} from '@/lib/trainer-activation'

const InitiateSchema = z.object({
  provider: z.enum(['STRIPE', 'PAWAPAY']),
  /**
   * Numéro et opérateur mobile money. Obligatoire pour PawaPay, qui adresse un
   * téléphone et non un compte ; ignoré pour Stripe.
   */
  payer: MobileMoneyPayerSchema.optional(),
})

/**
 * Ce qu'il reste à régler, ou 404 s'il n'y a rien à payer.
 *
 * Réconcilie **avant** de répondre : le webhook est la voie nominale, mais il
 * peut se perdre — et il n'atteint jamais `localhost` en développement. Sans
 * cet appel, un paiement abouti chez le fournisseur laisserait l'écran sur
 * « en attente » sans issue. C'est cette route que le panneau interroge en
 * revenant de Stripe puis à intervalle régulier : elle est le point où un
 * règlement égaré se rattrape.
 */
export async function GET() {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  await reconcileActivationPayment(ctx.user.id)

  const state = await getActivationState(ctx.user.id)
  if (!state) return error('NOTHING_TO_PAY', 'Aucun abonnement à régler', 404)
  return success(state)
}

/**
 * `requireAuth` et non `requireLearner` : le candidat est `PENDING_TRAINER`
 * depuis la soumission de son dossier, et c'est précisément dans cet état
 * qu'il vient régler. Le service vérifie de son côté que le dossier est
 * approuvé et qu'aucun espace n'est déjà ouvert.
 */
export async function POST(request: Request) {
  const ctx = await requireAuth()
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
    return success(
      await initiateActivationPayment(ctx.user.id, parsed.data.provider, parsed.data.payer),
      {},
      201,
    )
  } catch (err) {
    const code = err instanceof Error ? err.message : ''
    if (code === 'ALREADY_TRAINER') {
      return error('ALREADY_TRAINER', 'Votre espace formateur est déjà ouvert.', 409)
    }
    if (code === 'APPLICATION_NOT_APPROVED') {
      return error(
        'APPLICATION_NOT_APPROVED',
        "Votre candidature n'est pas encore validée : il n'y a rien à régler.",
        409,
      )
    }
    if (code === 'PAYMENT_IN_PROGRESS') {
      return error(
        'PAYMENT_IN_PROGRESS',
        "Un paiement est déjà en cours. Terminez-le, ou attendez qu'il expire avant d'en changer.",
        409,
      )
    }
    // L'espace vient d'être ouvert sans rien encaisser : la grille est passée à
    // zéro entre l'approbation et le clic. Ce n'est pas une panne, c'est une
    // bonne nouvelle — l'écran n'a qu'à se relire.
    if (code === 'NOTHING_TO_PAY') {
      return error('NOTHING_TO_PAY', 'Aucun montant à régler : votre espace est ouvert.', 409)
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
    // Bornes de l'opérateur, numéro invalide, devise sans taux ouvert : autant
    // de refus que la table nomme et que ce repli avalait.
    const translated = domainErrorResponse(err)
    if (translated) return translated
    console.error('[API:TRAINER_ACTIVATION]', err)
    return error('INTERNAL_ERROR', 'Erreur', 500)
  }
}
