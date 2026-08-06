// L'invité — consulter puis accepter son invitation
//
// La lecture est ouverte aux visiteurs non connectés : quelqu'un qui reçoit un
// lien doit pouvoir voir ce qu'on lui propose avant de créer un compte. Elle ne
// révèle rien de plus que ce que l'e-mail disait déjà, et l'adresse visée n'est
// rendue que masquée (arbitrage 86).
//
// L'acceptation, elle, exige une session : elle ouvre une adhésion, donc elle
// désigne quelqu'un.

import { success, error, requireAuth, requireLearner, getAuthContext } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier } from '@/lib/rate-limit'
import { previewInvitation, acceptGiftInvitation } from '@/lib/invitations'

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  // Un jeton est un secret devinable en théorie : sans plafond, cette route est
  // un oracle qui dit lesquels existent.
  const limit = checkRateLimit(getRateLimitIdentifier(null, request), 'invitation-preview', 30, 600_000)
  if (!limit.allowed) return error('RATE_LIMITED', 'Trop de tentatives.', 429)

  const auth = await getAuthContext()
  const preview = await previewInvitation(token, auth?.user.id ?? null)
  // `previewInvitation` rend `null` pour tout ce qui n'est pas exploitable —
  // inconnu, expiré, révoqué, épuisé. Un seul message pour les quatre : les
  // distinguer dirait au porteur d'un jeton au hasard s'il a visé juste.
  if (!preview) return error('INVITATION_NOT_FOUND', 'Cette invitation n’est plus valable.', 404)

  return success(preview)
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  // L'invitation gratuite est le contournement le plus simple de l'interdiction
  // d'adhérer : il suffirait à un administrateur de s'en faire envoyer une.
  const ctx = await requireLearner()
  if (ctx instanceof Response) return ctx
  const { token } = await params

  const limit = checkRateLimit(getRateLimitIdentifier(ctx.user, request), 'invitation-accept', 10, 600_000)
  if (!limit.allowed) return error('RATE_LIMITED', 'Trop de tentatives.', 429)

  try {
    return success(await acceptGiftInvitation(token, ctx.user.id))
  } catch (err) {
    const code = err instanceof Error ? err.message : 'INTERNAL_ERROR'
    const messages: Record<string, [string, number]> = {
      INVITATION_NOT_FOUND: ['Cette invitation n’est plus valable.', 404],
      INVITATION_NOT_A_GIFT: ['Cette invitation mène au tunnel d’adhésion, elle ne s’accepte pas ici.', 409],
      INVITATION_ALREADY_USED: ['Cette invitation a déjà été utilisée.', 409],
      COMMUNITY_NOT_FOUND: ['Cette communauté n’existe plus.', 404],
      INVITATION_EMAIL_MISMATCH: ['Cette invitation vise une autre adresse que la vôtre.', 403],
      EMAIL_NOT_VERIFIED: ['Vérifiez votre adresse e-mail avant d’accepter.', 403],
      ALREADY_MEMBER: ['Vous êtes déjà membre de cette communauté.', 409],
      CANNOT_JOIN_OWN_COMMUNITY: ['Vous animez cette communauté.', 400],
      ADMIN_CANNOT_ACT_AS_LEARNER: ["Un compte d'administration ne peut pas rejoindre une communauté.", 403],
      MEMBERSHIP_BANNED: ['Vous avez été banni de cette communauté.', 403],
      ACCOUNT_BANNED: ['Votre compte ne permet pas de rejoindre une communauté.', 403],
    }
    const [message, status] = messages[code] ?? ['L’invitation n’a pas pu être acceptée.', 500]
    return error(code, message, status)
  }
}
