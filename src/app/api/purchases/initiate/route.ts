// Lot 4 — Achat : initier un paiement
import { success, error, requireLearner, requireVerifiedEmail, parseBody, errorFromException } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { initiatePurchase } from '@/lib/purchases'
import { MobileMoneyPayerSchema } from '@/lib/payment-input'
import { z } from 'zod'

const InitiateSchema = z.object({
  courseId: z.string().uuid(),
  provider: z.enum(['STRIPE', 'PAWAPAY']),
  /**
   * Numéro et opérateur mobile money. Obligatoire pour PawaPay, qui adresse un
   * téléphone et non un compte ; ignoré pour Stripe.
   */
  payer: MobileMoneyPayerSchema.optional(),
})

export async function POST(request: Request) {
  // `requireLearner` et non `requireAuth` : un compte d'administration n'achète
  // pas. Le refus tombe avant le compteur de tentatives ci-dessous — une règle
  // de gouvernance n'a pas à consommer un quota anti-abus.
  const ctx = await requireLearner()
  if (ctx instanceof Response) return ctx
  // M6 — on ne paie pas avec une adresse qu'on n'a pas prouvé contrôler.
  const unverified = await requireVerifiedEmail(ctx.user.id)
  if (unverified) return unverified

  // Le plafond est large — abandonner un paiement puis le reprendre est normal —
  // mais il existe : sans lui, une boucle côté client fabrique des dizaines
  // d'intentions de paiement facturées chez le fournisseur.
  const limit = checkRateLimit(
    getRateLimitIdentifier(ctx.user, request), 'PURCHASE_INITIATE',
    RATE_LIMITS.PURCHASE_INITIATE.max, RATE_LIMITS.PURCHASE_INITIATE.windowMs,
  )
  if (!limit.allowed) return error('RATE_LIMITED', 'Trop de tentatives de paiement, réessayez dans quelques minutes', 429)

  const parsed = await parseBody(request, InitiateSchema)
  if (parsed instanceof Response) return parsed

  try {
    const result = await initiatePurchase(
      parsed.data.courseId, ctx.user.id, parsed.data.provider, parsed.data.payer,
    )
    return success(result, {}, 201)
  } catch (err: any) {
    if (err.message === 'COURSE_NOT_FOUND') return error('COURSE_NOT_FOUND', 'Cours introuvable', 404)
    if (err.message === 'COURSE_NOT_AVAILABLE') return error('COURSE_NOT_AVAILABLE', 'Cours non disponible', 403)
    if (err.message === 'ALREADY_PURCHASED') return error('ALREADY_PURCHASED', 'Déjà acheté', 409)
    if (err.message === 'PAYMENT_IN_PROGRESS') {
      return error(
        'PAYMENT_IN_PROGRESS',
        "Un paiement est déjà en cours sur ce moyen. Terminez-le, ou attendez qu'il expire avant d'en changer.",
        409,
      )
    }
    if (err.message === 'COURSE_NOT_FOR_SALE') {
      return error('COURSE_NOT_FOR_SALE', 'Cette ressource est incluse dans une communauté', 422)
    }
    // Règle de gouvernance, pas panne : sans cette ligne le refus tomberait dans
    // le 500 générique et se lirait comme un incident.
    if (err.message === 'CANNOT_BUY_OWN_COURSE') {
      return error('CANNOT_BUY_OWN_COURSE', "Vous êtes l'auteur de cette ressource : vous ne l'achetez pas.", 422)
    }
    // Filet : `requireLearner` ci-dessus a normalement déjà refusé. Sans cette
    // ligne, le refus levé par le service tomberait dans le 500 générique et se
    // lirait comme une panne plutôt que comme une règle.
    if (err.message === 'ADMIN_CANNOT_ACT_AS_LEARNER') {
      return error('ADMIN_CANNOT_ACT_AS_LEARNER', "Un compte d'administration ne peut pas acheter.", 403)
    }
    // Tout le mobile money manquait à l'appel — opérateur indisponible, montant
    // hors bornes, numéro invalide, devise sans taux ouvert. L'acheteur lisait
    // « Erreur » là où la table sait dire lequel des quatre le bloque.
    return errorFromException(err)
  }
}
