// Adhésion à une communauté — souscrire, régler une échéance, résilier.
//
// La communauté est désignée par son slug : c'est ce que porte l'URL publique
// d'où part le geste, et l'identifiant interne n'a pas à traverser le front.
import { z } from 'zod'
import { db } from '@/lib/db'
import { success, error, requireAuth, requireLearner, parseBody, errorFromException } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { initiateMembershipPayment, cancelMembership, getMembership } from '@/lib/memberships'
import { hashToken, resolveInvitationForTunnel } from '@/lib/invitations'
import { MobileMoneyPayerSchema } from '@/lib/payment-input'

const JoinSchema = z
  .object({
    provider: z.enum(['STRIPE', 'PAWAPAY']),
    /**
     * Numéro et opérateur mobile money. Obligatoire pour PawaPay, qui adresse un
     * téléphone et non un compte ; ignoré pour Stripe.
     */
    payer: MobileMoneyPayerSchema.optional(),
    /**
     * Jeton d'une invitation payante, quand le tunnel est entré depuis un lien.
     * `initiateMembershipPayment` acceptait déjà un `invitationId` — personne ne
     * le lui passait, si bien qu'une adhésion venue d'un parrainage n'était
     * attribuée à personne (arbitrage 76) et que l'invitation restait
     * indéfiniment consommable.
     */
    invitation: z.string().trim().min(1).optional(),
  })
  .strict()

async function communityIdFromSlug(slug: string): Promise<string | null> {
  const community = await db.community.findFirst({
    where: { slug, status: 'active' },
    select: { id: true },
  })
  return community?.id ?? null
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const { slug } = await params
  const communityId = await communityIdFromSlug(slug)
  if (!communityId) return error('COMMUNITY_NOT_FOUND', 'Communauté introuvable', 404)

  return success(await getMembership(communityId, ctx.user.id))
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  // Adhérer est un acte d'apprenant : l'administration en est écartée. Le GET
  // et le DELETE gardent `requireAuth` — ils ne créent rien, et un compte qui
  // ne peut pas adhérer n'a de toute façon aucune adhésion à lire ou résilier.
  const ctx = await requireLearner()
  if (ctx instanceof Response) return ctx

  const limit = checkRateLimit(
    getRateLimitIdentifier(ctx.user, request), 'membership-join',
    RATE_LIMITS.PURCHASE_INITIATE.max, RATE_LIMITS.PURCHASE_INITIATE.windowMs,
  )
  if (!limit.allowed) return error('RATE_LIMITED', 'Trop de tentatives, réessayez dans un instant', 429)

  const parsed = await parseBody(request, JoinSchema)
  if (parsed instanceof Response) return parsed

  const { slug } = await params
  const communityId = await communityIdFromSlug(slug)
  if (!communityId) return error('COMMUNITY_NOT_FOUND', 'Communauté introuvable', 404)

  // L'invitation est seulement **portée** par l'achat : rien n'est consommé
  // ici (arbitrage 78). Un tunnel abandonné la laisse utilisable ; c'est le
  // webhook, à la confirmation du paiement, qui la décompte.
  let invitationId: string | null = null
  if (parsed.data.invitation) {
    const candidate = await db.communityInvitation.findUnique({
      where: { tokenHash: hashToken(parsed.data.invitation) },
      select: { id: true },
    })
    // Un jeton invalide ou périmé ne bloque pas l'adhésion : la personne paie
    // le tarif plein, comme si elle était venue du catalogue. La refuser
    // reviendrait à punir un invité d'un lien expiré.
    if (candidate) {
      const resolved = await resolveInvitationForTunnel(candidate.id, ctx.user.id, communityId)
      invitationId = resolved?.invitationId ?? null
    }
  }

  try {
    const intent = await initiateMembershipPayment(
      communityId,
      ctx.user.id,
      parsed.data.provider,
      invitationId,
      parsed.data.payer,
    )

    // Plus aucune simulation ici : le paiement est ouvert chez le fournisseur
    // par `initiateMembershipPayment`, et seul son callback signé crédite le
    // formateur et ouvre l'adhésion.
    return success(intent)
  } catch (err) {
    return errorFromException(err)
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const { slug } = await params
  const communityId = await communityIdFromSlug(slug)
  if (!communityId) return error('COMMUNITY_NOT_FOUND', 'Communauté introuvable', 404)

  try {
    return success(await cancelMembership(communityId, ctx.user.id))
  } catch (err) {
    return errorFromException(err)
  }
}
