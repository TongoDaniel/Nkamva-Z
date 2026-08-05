// Formateur — émettre et relire les invitations de son salon
//
// Le lot invitations était complet côté service — émission nominative, lien de
// parrainage, révocation, aperçu, acceptation — et **aucune route ne
// l'atteignait**. Les arbitrages 71 à 86, le modèle et ses contraintes SQL
// existaient sans qu'un formateur puisse inviter qui que ce soit.

import { z } from 'zod'
import { success, error, requireTrainer, parseBody, parsePagination } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier } from '@/lib/rate-limit'
import {
  issueNominativeInvitation,
  issueShareLink,
  listCommunityInvitations,
  sendInvitationEmail,
  INVITATION_GIFT_MAX_MONTHS,
} from '@/lib/invitations'
import { db } from '@/lib/db'

const IssueSchema = z
  .object({
    kind: z.enum(['NOMINATIVE', 'SHARE_LINK']),
    grant: z.enum(['GIFT', 'PAID']).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
    giftMonths: z.number().int().min(1).max(INVITATION_GIFT_MAX_MONTHS).optional(),
    /** Envoyer le jeton à l'adresse visée. Sans objet pour un lien partageable. */
    notify: z.boolean().optional(),
  })
  .strict()

export async function GET(request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const { communityId } = await params
  const { page, pageSize } = parsePagination(new URL(request.url))

  try {
    const list = await listCommunityInvitations(communityId, ctx.user.id, page, pageSize)
    return success(list.items, { total: list.total, page, pageSize })
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_COMMUNITY_TRAINER') {
      return error('NOT_OWNER', 'Cette communauté n’est pas la vôtre.', 403)
    }
    if (err instanceof Error && err.message === 'COMMUNITY_NOT_FOUND') {
      return error('COMMUNITY_NOT_FOUND', 'Communauté introuvable.', 404)
    }
    return error('INTERNAL_ERROR', 'La liste n’a pas pu être chargée.', 500)
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const ctx = await requireTrainer()
  if (ctx instanceof Response) return ctx
  const { communityId } = await params

  // Une invitation part par e-mail vers une adresse choisie par l'émetteur :
  // sans plafond, la fonction devient un relais d'envoi.
  const limit = checkRateLimit(getRateLimitIdentifier(ctx.user, request), 'invitation-issue', 30, 3_600_000)
  if (!limit.allowed) {
    return error('RATE_LIMITED', `Trop d'invitations émises. Réessayez dans ${limit.retryAfter} s.`, 429)
  }

  const parsed = await parseBody(request, IssueSchema)
  if (parsed instanceof Response) return parsed
  const input = parsed.data

  try {
    if (input.kind === 'SHARE_LINK') {
      const issued = await issueShareLink(communityId, ctx.user.id)
      return success({ id: issued.invitation.id, url: issued.url }, {}, 201)
    }

    if (!input.email) return error('INVALID_EMAIL', 'Renseignez l’adresse à inviter.', 400)
    const grant = input.grant ?? 'PAID'

    const issued = await issueNominativeInvitation({
      communityId,
      issuerId: ctx.user.id,
      email: input.email,
      grant,
      giftMonths: grant === 'GIFT' ? (input.giftMonths ?? 1) : null,
    })

    // L'envoi ne conditionne pas l'émission : une invitation existe même si
    // Resend refuse, et le formateur peut toujours recopier le lien. L'échec
    // est signalé, pas fatal.
    let emailed = false
    if (input.notify !== false) {
      const community = await db.community.findUniqueOrThrow({
        where: { id: communityId },
        select: {
          name: true, priceFcfa: true,
          trainerProfile: { select: { user: { select: { fullName: true } } } },
        },
      })
      try {
        await sendInvitationEmail({
          to: input.email,
          url: issued.url,
          community: { name: community.name, priceFcfa: community.priceFcfa },
          trainerName: community.trainerProfile.user.fullName,
          grant,
          giftMonths: issued.invitation.giftMonths,
          expiresAt: issued.invitation.expiresAt,
        })
        emailed = true
      } catch (sendError) {
        console.error('[INVITATION:EMAIL_FAILED]', String(sendError))
      }
    }

    // Le jeton nominatif n'est **jamais** restitué ensuite (il reste haché) :
    // c'est la seule fois où l'émetteur peut le recopier.
    return success({ id: issued.invitation.id, url: issued.url, emailed }, {}, 201)
  } catch (err) {
    const code = err instanceof Error ? err.message : 'INTERNAL_ERROR'
    const messages: Record<string, [string, number]> = {
      NOT_COMMUNITY_TRAINER: ['Cette communauté n’est pas la vôtre.', 403],
      MEMBER_CANNOT_GIFT: ['Seul l’animateur peut offrir des mois.', 403],
      COMMUNITY_NOT_FOUND: ['Communauté introuvable.', 404],
      INVALID_EMAIL: ['Adresse e-mail invalide.', 400],
      GIFT_MONTHS_OUT_OF_RANGE: [`Entre 1 et ${INVITATION_GIFT_MAX_MONTHS} mois offerts.`, 400],
      ALREADY_MEMBER: ['Cette personne est déjà membre de votre salon.', 409],
      CANNOT_JOIN_OWN_COMMUNITY: ['Vous animez ce salon : vous ne pouvez pas y adhérer.', 400],
      INVITATION_QUOTA_EXCEEDED: ['Quota de gratuités atteint pour ce mois.', 429],
      INVITE_LINK_FORBIDDEN_ON_PRIVATE: [
        'Un salon fermé ne s’entre que sur invitation nominative : le lien de parrainage y est interdit.',
        409,
      ],
      NOT_A_MEMBER: ['Il faut être membre du salon pour en partager le lien.', 403],
    }
    const [message, status] = messages[code] ?? ['L’invitation n’a pas pu être émise.', 500]
    return error(code, message, status)
  }
}
