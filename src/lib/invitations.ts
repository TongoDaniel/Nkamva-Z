// ==========================================================================
// Invitations aux communautés — arbitrages 71 à 86
// ==========================================================================
// Spécification complète : `docs/invitations.md`.
//
// Une invitation est **un droit d'entrer**, matérialisé par un jeton dans une
// URL. Elle ne crée aucun compte, ne prélève rien, et ne lève aucune décision
// de modération.
//
// Deux attributs distincts gouvernent tout ce module, et les confondre serait
// l'erreur de conception à ne pas commettre :
//
//   `kind`  — la **forme** : NOMINATIVE (adressée, usage unique) ou SHARE_LINK.
//   `grant` — la **nature** : GIFT (1 à 3 mois offerts) ou PAID (tunnel).
//
// Le nominatif porte les deux natures (arbitrage 73). S'il n'avait porté que la
// gratuité, une communauté privée — qui ne s'entre qu'au nominatif — n'aurait
// jamais pu encaisser un franc.
//
// Trois règles tiennent le reste :
//
// 1. **Rien n'est offert sans décision du formateur.** Le membre parraine, il
//    n'offre pas (arbitrage 75) : offrir coûte de l'argent à quelqu'un d'autre.
// 2. **Une invitation payante ne se consomme qu'au paiement confirmé**
//    (arbitrage 78) — sinon un tunnel abandonné brûlerait l'invitation. C'est
//    `consumeInvitationForPurchase`, appelée depuis le webhook, qui décompte.
// 3. **Une invitation ne blanchit rien** (arbitrage 79) : ni bannissement, ni
//    sanction, ni suspension. Elle ouvre une porte, elle n'annule pas une
//    décision.
//
// Le **statut n'est pas une colonne** : `invitationStatus()` le déduit. Une
// colonne mentirait le jour où l'expiration tombe, sans que rien ne l'ait
// écrite.
// ==========================================================================

import { createHash, randomBytes } from 'crypto'
import type {
  CommunityInvitation, CommunityVisibility, InvitationGrant, InvitationKind,
} from '@prisma/client'
import { db } from './db'
import { audit, auditStandalone } from './audit'
import { notify, notifyWithEmail, deliverSideEffects, absoluteUrl, TRANSACTIONAL } from './notification'
import { sendEmail, renderSimpleEmail } from './email'
import { fmtFcfa } from './format'
import { assertCanActAsLearner } from './roles'
import { getSettingNumber } from './settings'
import { isBannedFromCommunity, recountCommunityMembers } from './communities'
import type { PrismaTransaction } from './types'

/** Voir `memberships.ts` — les listes de statuts ouverts doivent rester alignées. */
const OPEN_STATUSES = ['ACTIVE', 'PAST_DUE', 'BANNED'] as const

const DAY_MS = 86_400_000

// --- Valeurs nommées, non arbitrées -----------------------------------------
// Isolées comme `MEMBERSHIP_GRACE_DAYS` : pour être discutées, pas découvertes
// au fond d'une condition. Voir « Points non arbitrés » de decisions-nkamva.md.

/** Une invitation adressée qui n'est pas suivie d'effet en deux semaines ne l'est plus. */
export const INVITATION_NOMINATIVE_TTL_DAYS = 14
/** Un lien de parrainage vit un trimestre, puis se régénère. */
export const INVITATION_SHARE_LINK_TTL_DAYS = 90
/** Arbitré (75). Ce plafond-ci n'est pas une valeur de confort. */
export const INVITATION_GIFT_MAX_MONTHS = 3
/**
 * Rétention de l'adresse invitée après l'état terminal (arbitrage 80). Écrite
 * dans la politique de confidentialité : source unique dans `rules.ts`.
 */
export { INVITATION_RETENTION_DAYS } from './rules'
import { INVITATION_RETENTION_DAYS } from './rules'

// --- Jeton ------------------------------------------------------------------

export interface MintedToken {
  /** Le clair. Il ne sort d'ici que vers l'e-mail ou l'écran, jamais vers un journal. */
  token: string
  tokenHash: string
  tokenPrefix: string
}

/**
 * 32 octets de hasard, encodés base64url. Le haché est le chemin de recherche
 * des deux formes ; SHA-256 suffit, là où un mot de passe exigerait argon2 :
 * on cherche **par** le jeton, et 256 bits d'entropie ne se devinent pas.
 */
export function mintToken(): MintedToken {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashToken(token), tokenPrefix: token.slice(0, 8) }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// --- Statut dérivé ----------------------------------------------------------

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXHAUSTED' | 'EXPIRED' | 'REVOKED'

/**
 * Seul `PENDING` est acceptable. Les quatre autres états sont terminaux.
 *
 * **`ACCEPTED` n'existe que pour un nominatif** (arbitrage 123). Un lien
 * partageable est multi-usage par conception — jusqu'à 25 acceptations sur 90
 * jours glissants (arbitrage 102) — et n'a donc pas d'état « accepté » : il se
 * lit à son compteur d'usages, et ne devient terminal qu'épuisé, expiré ou
 * révoqué.
 *
 * Le test sur `kind` est défensif autant que documentaire : `acceptedAt` n'est
 * posé que sur un nominatif, mais s'il l'était un jour par erreur, un lien
 * encore utilisable s'afficherait « acceptée » et cesserait d'être proposé.
 */
export function invitationStatus(
  inv: Pick<CommunityInvitation, 'kind' | 'revokedAt' | 'acceptedAt' | 'usesCount' | 'maxUses' | 'expiresAt'>,
  now: Date = new Date(),
): InvitationStatus {
  if (inv.revokedAt) return 'REVOKED'
  if (inv.kind === 'NOMINATIVE' && inv.acceptedAt) return 'ACCEPTED'
  if (inv.usesCount >= inv.maxUses) return 'EXHAUSTED'
  if (inv.expiresAt.getTime() <= now.getTime()) return 'EXPIRED'
  return 'PENDING'
}

/**
 * `j••••@exemple.com` — assez pour qu'un invité reconnaisse son adresse, pas
 * assez pour la découvrir (arbitrage 82).
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '•••'
  return `${local.slice(0, 1)}${'•'.repeat(Math.max(3, local.length - 1))}@${domain}`
}

// --- Émission ---------------------------------------------------------------

interface CommunityForIssue {
  id: string
  name: string
  slug: string
  status: string
  visibility: CommunityVisibility
  priceFcfa: number
  trainerUserId: string
  trainerName: string | null
}

async function loadCommunity(communityId: string): Promise<CommunityForIssue> {
  const community = await db.community.findUnique({
    where: { id: communityId },
    select: {
      id: true, name: true, slug: true, status: true, visibility: true, priceFcfa: true,
      trainerProfile: { select: { userId: true, user: { select: { fullName: true } } } },
    },
  })
  if (!community || community.status !== 'active') throw new Error('COMMUNITY_NOT_FOUND')
  return {
    id: community.id,
    name: community.name,
    slug: community.slug,
    status: community.status,
    visibility: community.visibility,
    priceFcfa: community.priceFcfa,
    trainerUserId: community.trainerProfile.userId,
    trainerName: community.trainerProfile.user.fullName,
  }
}

export interface IssueNominativeParams {
  communityId: string
  /** L'émetteur, qui doit être le formateur de la communauté. */
  issuerId: string
  email: string
  grant: InvitationGrant
  /** 1 à 3, exigé pour GIFT, interdit pour PAID. */
  giftMonths?: number | null
}

export interface IssuedInvitation {
  invitation: CommunityInvitation
  /** Le clair, rendu une seule fois. Pour un nominatif, il n'est jamais restitué ensuite. */
  token: string
  url: string
}

/**
 * Invitation adressée, à usage unique — la seule forme qui puisse offrir des
 * mois (arbitrage 72), et la seule qui entre dans une communauté privée
 * (arbitrage 74).
 *
 * Réinviter la même adresse **révoque la précédente** dans la même transaction,
 * comme `issueOtp` invalide le code précédent : sans cela, un formateur qui s'y
 * reprend à trois fois laisse trois gratuités vivantes pour une seule décision.
 */
export async function issueNominativeInvitation(params: IssueNominativeParams): Promise<IssuedInvitation> {
  const community = await loadCommunity(params.communityId)

  // Le nominatif est un geste de formateur, quelle que soit sa nature. Le membre
  // n'a que le lien de parrainage (arbitrage 75).
  if (community.trainerUserId !== params.issuerId) {
    throw new Error(params.grant === 'GIFT' ? 'MEMBER_CANNOT_GIFT' : 'NOT_COMMUNITY_TRAINER')
  }

  const email = params.email.trim().toLowerCase()
  if (!email || !email.includes('@')) throw new Error('INVALID_EMAIL')

  // Une invitation payante ne porte pas de mois offerts, et la contrainte CHECK
  // le tient aussi en base : refuser ici donne juste un message utilisable.
  const giftMonths = params.grant === 'GIFT' ? (params.giftMonths ?? 1) : null
  if (giftMonths !== null) {
    if (!Number.isInteger(giftMonths) || giftMonths < 1 || giftMonths > INVITATION_GIFT_MAX_MONTHS) {
      throw new Error('GIFT_MONTHS_OUT_OF_RANGE')
    }
  } else if (params.giftMonths != null) {
    throw new Error('GIFT_MONTHS_OUT_OF_RANGE')
  }

  // Le formateur anime sa communauté, il n'y adhère pas — la même règle que
  // `initiateMembershipPayment`, appliquée à l'adresse visée cette fois.
  const invitee = await db.user.findUnique({
    where: { email },
    select: { id: true, deletedAt: true },
  })
  if (invitee && !invitee.deletedAt) {
    if (invitee.id === community.trainerUserId) throw new Error('CANNOT_JOIN_OWN_COMMUNITY')
    const open = await db.communitySubscription.count({
      where: { communityId: community.id, learnerId: invitee.id, status: { in: [...OPEN_STATUSES] } },
    })
    if (open > 0) throw new Error('ALREADY_MEMBER')
  }

  // Quota de gratuité : une garde de sécurité, pas une règle produit. Elle
  // empêche qu'une route distraite ou un script vide la valeur de l'abonnement
  // d'une communauté en une nuit.
  //
  // Arbitrage 102 — la valeur vit dans `Setting`, pas ici : ce n'est pas une
  // décision qui engage la plateforme, c'est un réglage que le Super-admin doit
  // pouvoir desserrer sans livraison le jour où un formateur en a besoin.
  if (params.grant === 'GIFT') {
    const quota = await getSettingNumber('invitations.gift_monthly_quota')
    const since = new Date(Date.now() - 30 * DAY_MS)
    const issued = await db.communityInvitation.count({
      where: { communityId: community.id, grant: 'GIFT', createdAt: { gte: since } },
    })
    if (issued >= quota) throw new Error('INVITATION_QUOTA_EXCEEDED')
  }

  const minted = mintToken()
  const expiresAt = new Date(Date.now() + INVITATION_NOMINATIVE_TTL_DAYS * DAY_MS)

  const invitation = await db.$transaction(async (tx) => {
    // La révocation précède la création : l'index unique partiel
    // `community_invitations_open_nominative_unique` refuserait la seconde ligne
    // ouverte, et il a raison de le faire.
    const superseded = await tx.communityInvitation.updateMany({
      where: {
        communityId: community.id, email, kind: 'NOMINATIVE',
        revokedAt: null, acceptedAt: null,
      },
      data: { revokedAt: new Date(), revokedById: params.issuerId },
    })

    const created = await tx.communityInvitation.create({
      data: {
        communityId: community.id,
        issuerId: params.issuerId,
        issuerRole: 'TRAINER',
        kind: 'NOMINATIVE',
        grant: params.grant,
        email,
        giftMonths,
        tokenHash: minted.tokenHash,
        tokenPrefix: minted.tokenPrefix,
        token: null,
        maxUses: 1,
        expiresAt,
      },
    })

    await audit(tx, {
      actorId: params.issuerId, actorRole: 'TRAINER',
      action: 'INVITATION_ISSUED', targetType: 'CommunityInvitation', targetId: created.id,
      // L'adresse est journalisée : c'est la trace du geste, et l'arbitrage 80
      // la couvre. Le jeton, lui, n'entre jamais dans un journal.
      meta: {
        communityId: community.id, kind: 'NOMINATIVE', grant: params.grant,
        email, giftMonths, supersededCount: superseded.count,
        expiresAt: expiresAt.toISOString(),
      },
    })

    return created
  })

  const url = absoluteUrl(`/invitation/${minted.token}`)

  await deliverSideEffects('INVITATION_ISSUED', { type: 'CommunityInvitation', id: invitation.id }, async () => {
    await sendInvitationEmail({
      to: email, community, grant: params.grant, giftMonths, url, expiresAt,
      trainerName: community.trainerName,
    })
    // L'invité qui a déjà un compte le voit aussi dans NKAMVA : l'e-mail peut
    // finir en indésirables, la notification non (arbitrage 85).
    if (invitee && !invitee.deletedAt) {
      await notify(invitee.id, {
        type: 'INVITATION_RECEIVED',
        title: `${community.trainerName ?? 'Un formateur'} vous invite dans ${community.name}`,
        body: params.grant === 'GIFT'
          ? `${giftMonths} mois offerts, à accepter avant le ${expiresAt.toLocaleDateString('fr-FR')}.`
          : `Rejoignez la communauté avant le ${expiresAt.toLocaleDateString('fr-FR')}.`,
        link: `/invitation/${minted.token}`,
      })
    }
  })

  return { invitation, token: minted.token, url }
}

/**
 * Lien de parrainage : plusieurs acceptations, jamais de gratuité
 * (arbitrage 72), jamais sur une communauté privée (arbitrage 74).
 *
 * Réentrante : rappelée par quelqu'un qui a déjà un lien ouvert, elle rend le
 * **même**. C'est ce qui permet au panneau « Inviter » de l'afficher à chaque
 * visite sans tuer le lien déjà partagé — et la raison pour laquelle le clair
 * d'un SHARE_LINK est stocké (voir la migration `20260805010000`).
 */
export async function issueShareLink(communityId: string, issuerId: string): Promise<IssuedInvitation> {
  const community = await loadCommunity(communityId)
  if (community.visibility === 'PRIVATE') throw new Error('INVITE_LINK_FORBIDDEN_ON_PRIVATE')

  const isTrainer = community.trainerUserId === issuerId
  if (!isTrainer) {
    const open = await db.communitySubscription.count({
      where: { communityId, learnerId: issuerId, status: { in: [...OPEN_STATUSES] } },
    })
    if (open === 0) throw new Error('NOT_A_MEMBER')
  }

  const existing = await db.communityInvitation.findFirst({
    where: { communityId, issuerId, kind: 'SHARE_LINK', revokedAt: null },
  })
  if (existing?.token && invitationStatus(existing) === 'PENDING') {
    return {
      invitation: existing,
      token: existing.token,
      url: absoluteUrl(`/invitation/${existing.token}`),
    }
  }

  const minted = mintToken()
  const expiresAt = new Date(Date.now() + INVITATION_SHARE_LINK_TTL_DAYS * DAY_MS)
  // Arbitrage 102 — plafond administrable. Il est **figé sur le lien** au
  // moment de l'émettre : relire le réglage à chaque acceptation ferait varier
  // en cours de route la capacité d'un lien déjà en circulation.
  const maxUses = await getSettingNumber('invitations.share_link_max_uses')

  const invitation = await db.$transaction(async (tx) => {
    // Un lien épuisé ou expiré occupe encore l'index partiel : le révoquer est
    // ce qui libère la place du suivant.
    if (existing) {
      await tx.communityInvitation.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedById: issuerId },
      })
    }

    const created = await tx.communityInvitation.create({
      data: {
        communityId,
        issuerId,
        issuerRole: isTrainer ? 'TRAINER' : 'MEMBER',
        kind: 'SHARE_LINK',
        grant: 'PAID',
        email: null,
        giftMonths: null,
        tokenHash: minted.tokenHash,
        tokenPrefix: minted.tokenPrefix,
        token: minted.token,
        maxUses,
        expiresAt,
      },
    })

    await audit(tx, {
      actorId: issuerId, actorRole: isTrainer ? 'TRAINER' : 'LEARNER',
      action: 'INVITATION_ISSUED', targetType: 'CommunityInvitation', targetId: created.id,
      meta: {
        communityId, kind: 'SHARE_LINK', grant: 'PAID',
        maxUses, expiresAt: expiresAt.toISOString(),
        replacedId: existing?.id ?? null,
      },
    })

    return created
  })

  return { invitation, token: minted.token, url: absoluteUrl(`/invitation/${minted.token}`) }
}

// --- Révocation -------------------------------------------------------------

/**
 * Révoque : le formateur de la communauté sur n'importe laquelle de ses
 * invitations, un membre sur son seul lien de parrainage.
 *
 * Un état terminal ne se rouvre pas — révoquer une invitation déjà acceptée
 * n'annule aucune adhésion, et c'est pourquoi la garde porte sur `revokedAt`
 * seul : l'appel est idempotent, il ne « défait » rien.
 */
export async function revokeInvitation(invitationId: string, actorId: string): Promise<void> {
  const invitation = await db.communityInvitation.findUnique({
    where: { id: invitationId },
    select: {
      id: true, communityId: true, issuerId: true, revokedAt: true,
      community: { select: { trainerProfile: { select: { userId: true } } } },
    },
  })
  if (!invitation) throw new Error('INVITATION_NOT_FOUND')

  const isTrainer = invitation.community.trainerProfile.userId === actorId
  if (!isTrainer && invitation.issuerId !== actorId) throw new Error('FORBIDDEN')
  if (invitation.revokedAt) return

  await db.$transaction(async (tx) => {
    const done = await tx.communityInvitation.updateMany({
      where: { id: invitationId, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: actorId },
    })
    if (done.count === 0) return
    await audit(tx, {
      actorId, actorRole: isTrainer ? 'TRAINER' : 'LEARNER',
      action: 'INVITATION_REVOKED', targetType: 'CommunityInvitation', targetId: invitationId,
      meta: { communityId: invitation.communityId },
    })
  })
}

// --- Visibilité de la communauté (arbitrages 74 et 81) ----------------------

export interface VisibilityChange {
  visibility: CommunityVisibility
  /** Liens de parrainage tués par la bascule. Le formateur doit le savoir avant. */
  revokedShareLinks: number
}

/**
 * Bascule public/privé. Passer en privé **révoque les liens partageables en
 * circulation**, dans la même transaction : sans cela la fermeture serait
 * cosmétique, un lien déjà copié continuant d'ouvrir la porte.
 *
 * La bascule retour ne ressuscite rien. Les liens révoqués restent morts, et
 * c'est voulu : on ne remet pas en service un lien dont on ignore où il a été
 * recopié pendant la fermeture.
 */
export async function setCommunityVisibility(
  communityId: string,
  trainerUserId: string,
  visibility: CommunityVisibility,
): Promise<VisibilityChange> {
  const community = await loadCommunity(communityId)
  if (community.trainerUserId !== trainerUserId) throw new Error('NOT_COMMUNITY_TRAINER')
  if (community.visibility === visibility) {
    return { visibility, revokedShareLinks: 0 }
  }

  return db.$transaction(async (tx) => {
    await tx.community.update({ where: { id: communityId }, data: { visibility } })

    let revokedShareLinks = 0
    if (visibility === 'PRIVATE') {
      const revoked = await tx.communityInvitation.updateMany({
        where: { communityId, kind: 'SHARE_LINK', revokedAt: null },
        data: { revokedAt: new Date(), revokedById: trainerUserId },
      })
      revokedShareLinks = revoked.count
      if (revokedShareLinks > 0) {
        await audit(tx, {
          actorId: trainerUserId, actorRole: 'TRAINER',
          action: 'INVITATION_REVOKED_BY_VISIBILITY', targetType: 'Community', targetId: communityId,
          meta: { count: revokedShareLinks },
        })
      }
    }

    await audit(tx, {
      actorId: trainerUserId, actorRole: 'TRAINER',
      action: 'COMMUNITY_VISIBILITY_CHANGED', targetType: 'Community', targetId: communityId,
      meta: { from: community.visibility, to: visibility, revokedShareLinks },
    })

    return { visibility, revokedShareLinks }
  })
}

// --- Lecture ----------------------------------------------------------------

export interface InvitationPreview {
  kind: InvitationKind
  grant: InvitationGrant
  giftMonths: number | null
  expiresAt: Date
  community: { slug: string; name: string; priceFcfa: number; trainerName: string | null }
  /** Adresse visée, masquée. Nulle pour un lien partageable. */
  invitedEmailMasked: string | null
  /** Ce qui empêche le lecteur d'accepter, s'il y a quelque chose. */
  blocker: AcceptBlocker | null
}

export type AcceptBlocker =
  | 'NOT_AUTHENTICATED'
  | 'INVITATION_EMAIL_MISMATCH'
  | 'EMAIL_NOT_VERIFIED'
  | 'ALREADY_MEMBER'
  | 'CANNOT_JOIN_OWN_COMMUNITY'
  | 'MEMBERSHIP_BANNED'
  | 'ACCOUNT_BANNED'

/**
 * Aperçu de la page `/invitation/[token]`.
 *
 * Rend `null` pour tout jeton qui n'est pas `PENDING` — inconnu, expiré,
 * révoqué, épuisé, ou pointant une communauté close. L'appelant affiche alors le
 * même message générique dans les cinq cas : dire lequel s'applique
 * renseignerait qui teste des jetons au hasard (arbitrage 82).
 */
export async function previewInvitation(token: string, viewerId?: string | null): Promise<InvitationPreview | null> {
  const invitation = await db.communityInvitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      community: {
        select: {
          slug: true, name: true, status: true, priceFcfa: true,
          trainerProfile: { select: { userId: true, user: { select: { fullName: true } } } },
        },
      },
    },
  })
  if (!invitation) return null
  if (invitationStatus(invitation) !== 'PENDING') return null
  if (invitation.community.status !== 'active') return null

  return {
    kind: invitation.kind,
    grant: invitation.grant,
    giftMonths: invitation.giftMonths,
    expiresAt: invitation.expiresAt,
    community: {
      slug: invitation.community.slug,
      name: invitation.community.name,
      priceFcfa: invitation.community.priceFcfa,
      trainerName: invitation.community.trainerProfile.user.fullName,
    },
    invitedEmailMasked: invitation.email ? maskEmail(invitation.email) : null,
    blocker: await blockerFor(invitation, viewerId ?? null),
  }
}

/**
 * Ce qui empêche ce lecteur précis d'accepter. Séparé de l'acceptation pour que
 * l'écran puisse l'annoncer **avant** le clic, mais l'acceptation le recalcule :
 * un aperçu n'est pas une autorisation.
 */
async function blockerFor(
  invitation: Pick<CommunityInvitation, 'communityId' | 'email' | 'kind'> & {
    community: { trainerProfile: { userId: string } }
  },
  viewerId: string | null,
): Promise<AcceptBlocker | null> {
  if (!viewerId) return 'NOT_AUTHENTICATED'

  const user = await db.user.findUnique({
    where: { id: viewerId },
    select: { id: true, email: true, emailVerifiedAt: true, sanctionLevel: true, suspendedAt: true, deletedAt: true },
  })
  if (!user || user.deletedAt || user.suspendedAt || user.sanctionLevel === 'BANNED') return 'ACCOUNT_BANNED'

  // L'invitation nominative est liée à une adresse, et le reste (arbitrage 72) :
  // l'accepter avec un autre compte la rendrait transférable, donc offrable à
  // n'importe qui par simple renvoi d'e-mail.
  if (invitation.kind === 'NOMINATIVE' && invitation.email && user.email.toLowerCase() !== invitation.email) {
    return 'INVITATION_EMAIL_MISMATCH'
  }
  // Arbitrage 83 : le lien ne vaut pas preuve de contrôle de l'adresse. La
  // connexion, elle, n'exige pas la vérification (`auth.ts`) — c'est donc ici
  // qu'elle se joue.
  if (!user.emailVerifiedAt) return 'EMAIL_NOT_VERIFIED'

  if (invitation.community.trainerProfile.userId === viewerId) return 'CANNOT_JOIN_OWN_COMMUNITY'

  const subscription = await db.communitySubscription.findFirst({
    where: { communityId: invitation.communityId, learnerId: viewerId, status: { in: [...OPEN_STATUSES] } },
    select: { status: true },
  })
  if (subscription?.status === 'BANNED') return 'MEMBERSHIP_BANNED'
  if (subscription) return 'ALREADY_MEMBER'
  // Une sanction survit à la fin de la période (M4) : une invitation n'est pas
  // une façon de revenir par une autre porte.
  if (await isBannedFromCommunity(invitation.communityId, viewerId)) return 'MEMBERSHIP_BANNED'

  return null
}

export interface InvitationListItem {
  id: string
  kind: InvitationKind
  grant: InvitationGrant
  status: InvitationStatus
  email: string | null
  giftMonths: number | null
  tokenPrefix: string
  usesCount: number
  maxUses: number
  expiresAt: Date
  createdAt: Date
  issuerRole: 'TRAINER' | 'MEMBER'
  issuerName: string | null
  /** Restitué pour un lien partageable seul — un nominatif ne se réaffiche pas. */
  url: string | null
}

/**
 * La liste du formateur. Elle porte un statut d'**invitation**, jamais un statut
 * de personne : elle ne dit pas si l'adresse invitée correspond à un compte
 * NKAMVA, ce qui offrirait une sonde d'énumération (arbitrage 86).
 */
export async function listCommunityInvitations(
  communityId: string,
  trainerUserId: string,
  page = 1,
  pageSize = 20,
): Promise<{ items: InvitationListItem[]; total: number }> {
  const community = await loadCommunity(communityId)
  if (community.trainerUserId !== trainerUserId) throw new Error('NOT_COMMUNITY_TRAINER')

  const take = Math.min(Math.max(pageSize, 1), 50)
  const [rows, total] = await Promise.all([
    db.communityInvitation.findMany({
      where: { communityId },
      orderBy: { createdAt: 'desc' },
      skip: (Math.max(page, 1) - 1) * take,
      take,
      include: { issuer: { select: { fullName: true } } },
    }),
    db.communityInvitation.count({ where: { communityId } }),
  ])

  return {
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      grant: row.grant,
      status: invitationStatus(row),
      email: row.email,
      giftMonths: row.giftMonths,
      tokenPrefix: row.tokenPrefix,
      usesCount: row.usesCount,
      maxUses: row.maxUses,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      issuerRole: row.issuerRole,
      issuerName: row.issuer.fullName,
      url: row.token ? absoluteUrl(`/invitation/${row.token}`) : null,
    })),
    total,
  }
}

// --- Acceptation d'une invitation offerte -----------------------------------

export interface GiftAcceptance {
  subscriptionId: string
  communitySlug: string
  communityName: string
  periodEnd: Date
  giftMonths: number
}

/**
 * Le seul chemin de la plateforme où une `CommunitySubscription` naît **sans**
 * webhook. Il porte donc lui-même tout ce que `activateMembershipForPurchase`
 * porte : création, compteur de membres, audit — et une échéance en attente
 * annulée, parce qu'on ne réclame pas ce qu'on est en train d'offrir.
 *
 * L'ordre compte. La consommation de l'invitation est écrite **avant** la
 * souscription, gardée sur `acceptedAt IS NULL` : c'est cette garde, et non la
 * lecture qui précède, qui empêche deux onglets d'ouvrir deux adhésions. Même
 * motif que `consumeOtp`.
 */
export async function acceptGiftInvitation(token: string, userId: string): Promise<GiftAcceptance> {
  // Avant de consommer quoi que ce soit : l'invitation gratuite est le chemin
  // par lequel l'interdiction d'adhérer se contournerait le plus simplement —
  // il suffirait à un administrateur de s'en faire envoyer une.
  await assertCanActAsLearner(userId)

  const invitation = await db.communityInvitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      community: {
        select: {
          id: true, name: true, slug: true, status: true,
          trainerProfile: { select: { userId: true } },
        },
      },
    },
  })
  if (!invitation) throw new Error('INVITATION_NOT_FOUND')
  if (invitationStatus(invitation) !== 'PENDING') throw new Error('INVITATION_NOT_FOUND')
  if (invitation.community.status !== 'active') throw new Error('COMMUNITY_NOT_FOUND')
  if (invitation.grant !== 'GIFT') throw new Error('INVITATION_NOT_A_GIFT')

  const blocker = await blockerFor(invitation, userId)
  if (blocker) throw new Error(blocker)

  const giftMonths = invitation.giftMonths ?? 1
  const periodStart = new Date()
  const periodEnd = new Date(periodStart)
  periodEnd.setMonth(periodEnd.getMonth() + giftMonths)

  const result = await db.$transaction(async (tx) => {
    const consumed = await tx.communityInvitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, revokedAt: null },
      data: { acceptedAt: new Date(), acceptedById: userId, usesCount: { increment: 1 } },
    })
    if (consumed.count === 0) throw new Error('INVITATION_ALREADY_USED')

    const subscription = await tx.communitySubscription.create({
      data: {
        communityId: invitation.communityId,
        learnerId: userId,
        status: 'ACTIVE',
        periodStart,
        periodEnd,
        // Nul, et c'est la définition même d'une adhésion offerte : rien ne l'a
        // payée, rien ne la reconduira (arbitrage 77).
        provider: null,
        purchaseId: null,
        invitationId: invitation.id,
      },
    })

    // Recompté, et non incrémenté : voir `recountCommunityMembers`. Une
    // adhésion offerte est un membre comme un autre, et ce compteur a dérivé
    // pour avoir été tenu à coups de `+1` depuis trois endroits.
    await recountCommunityMembers(tx, invitation.communityId)

    // Il était peut-être en train de payer. On n'encaisse pas ce qu'on offre.
    await tx.purchase.updateMany({
      where: { learnerId: userId, communityId: invitation.communityId, providerStatus: 'PENDING' },
      data: { providerStatus: 'CANCELED' },
    })

    await audit(tx, {
      actorId: userId, actorRole: 'LEARNER',
      action: 'MEMBERSHIP_STARTED', targetType: 'CommunitySubscription', targetId: subscription.id,
      meta: {
        communityId: invitation.communityId, invitationId: invitation.id,
        gifted: true, giftMonths, periodEnd: periodEnd.toISOString(),
      },
    })
    await audit(tx, {
      actorId: userId, actorRole: 'LEARNER',
      action: 'INVITATION_ACCEPTED', targetType: 'CommunityInvitation', targetId: invitation.id,
      meta: { communityId: invitation.communityId, grant: 'GIFT', giftMonths },
    })

    return subscription
  })

  await deliverSideEffects('INVITATION_ACCEPTED', { type: 'CommunityInvitation', id: invitation.id }, async () => {
    // Un accès qui s'ouvre est transactionnel : il ne se coupe pas. Le pendant
    // payant de cette annonce vit dans `purchase-settled.ts` — les deux chemins
    // ne se croisent jamais, une adhésion est offerte ou réglée, pas les deux.
    const terme = periodEnd.toLocaleDateString('fr-FR')
    const lienMembre = `/mes-communautes/${invitation.community.slug}`

    await notifyWithEmail(
      userId,
      {
        type: 'MEMBERSHIP_STARTED',
        title: `Bienvenue dans ${invitation.community.name}`,
        body: `${giftMonths} mois offerts, jusqu'au ${terme}. Rien ne vous sera prélevé : une adhésion offerte ne se reconduit pas.`,
        link: lienMembre,
      },
      {
        subject: `NKAMVA — bienvenue dans ${invitation.community.name}`,
        title: `Bienvenue dans ${invitation.community.name}`,
        paragraphs: [
          'Bonjour,',
          `Votre invitation est acceptée : ${giftMonths} mois vous sont offerts, jusqu'au ${terme}.`,
          "Rien ne vous sera prélevé — une adhésion offerte ne se reconduit pas d'elle-même. Vous serez prévenu avant son terme.",
        ],
        cta: { label: 'Ouvrir la communauté', url: absoluteUrl(lienMembre) },
      },
      TRANSACTIONAL,
    )
    // `/formateur/invitations` n'a jamais existé : la notification menait donc à
    // un 404, ce que le formateur lisait comme « l'acceptation n'a rien fait ».
    // Le panneau est une rubrique de la page communauté, et l'URL l'ouvre
    // désormais directement.
    const lien = '/formateur/communaute?onglet=invitations'
    const qui = invitation.email
      ? `${invitation.email} a rejoint la communauté.`
      : 'Un nouvel invité a rejoint la communauté.'

    await notifyWithEmail(
      invitation.issuerId,
      {
        type: 'INVITATION_ACCEPTED',
        title: `Votre invitation à ${invitation.community.name} a été acceptée`,
        body: qui,
        link: lien,
      },
      {
        subject: `NKAMVA — votre invitation à ${invitation.community.name} a été acceptée`,
        title: 'Votre invitation a été acceptée',
        paragraphs: ['Bonjour,', qui, `Communauté : ${invitation.community.name}.`],
        cta: { label: 'Voir mes invitations', url: absoluteUrl(lien) },
      },
      'relationalEmails',
    )
  })

  return {
    subscriptionId: result.id,
    communitySlug: invitation.community.slug,
    communityName: invitation.community.name,
    periodEnd,
    giftMonths,
  }
}

// --- Invitation payante : le tunnel, puis le webhook ------------------------

export interface TunnelInvitation {
  invitationId: string
  communityId: string
}

/**
 * Valide une invitation payante à l'entrée du tunnel d'adhésion, **sans rien
 * consommer** (arbitrage 78). Le cookie posé par `/invitation/[token]` porte
 * l'identifiant ; cette fonction le revalide à chaque usage, parce qu'un cookie
 * vieux d'une heure ne prouve rien sur l'état actuel de l'invitation.
 */
export async function resolveInvitationForTunnel(
  invitationId: string,
  userId: string,
  communityId: string,
): Promise<TunnelInvitation | null> {
  const invitation = await db.communityInvitation.findUnique({
    where: { id: invitationId },
    include: { community: { select: { trainerProfile: { select: { userId: true } } } } },
  })
  if (!invitation) return null
  if (invitation.communityId !== communityId) return null
  if (invitation.grant !== 'PAID') return null
  if (invitationStatus(invitation) !== 'PENDING') return null

  const blocker = await blockerFor(invitation, userId)
  // `ALREADY_MEMBER` n'est pas rédhibitoire ici : c'est le tunnel d'adhésion qui
  // tranche ce cas, avec son propre message. Tout le reste ferme la porte.
  if (blocker && blocker !== 'ALREADY_MEMBER') return null

  return { invitationId: invitation.id, communityId: invitation.communityId }
}

export interface InvitationConsumption {
  consumed: boolean
  /** Plafond franchi par un paiement en vol : l'accès passe, l'anomalie est tracée. */
  overrun: boolean
}

/**
 * Consomme l'invitation d'un achat confirmé. Appelée depuis
 * `activateMembershipForPurchase`, donc **dans la transaction du webhook** : la
 * consommation et l'ouverture de l'adhésion tombent ensemble ou pas du tout.
 *
 * Le plafond peut être franchi par un paiement parti avant que le dernier usage
 * ne soit décompté. Dans ce cas l'adhésion se crée quand même et l'anomalie est
 * journalisée : refuser l'accès à quelqu'un qui vient de payer serait
 * indéfendable, et l'argent, lui, est encaissé.
 */
export async function consumeInvitationForPurchase(
  tx: PrismaTransaction,
  invitationId: string,
  learnerId: string,
): Promise<InvitationConsumption> {
  const invitation = await tx.communityInvitation.findUnique({
    where: { id: invitationId },
    select: { id: true, kind: true, communityId: true, usesCount: true, maxUses: true, acceptedAt: true },
  })
  if (!invitation) return { consumed: false, overrun: false }

  const consumed = await tx.communityInvitation.updateMany({
    where: {
      id: invitationId,
      usesCount: { lt: invitation.maxUses },
      revokedAt: null,
      ...(invitation.kind === 'NOMINATIVE' ? { acceptedAt: null } : {}),
    },
    data: {
      usesCount: { increment: 1 },
      ...(invitation.kind === 'NOMINATIVE' ? { acceptedAt: new Date(), acceptedById: learnerId } : {}),
    },
  })

  if (consumed.count === 0) {
    await audit(tx, {
      actorId: learnerId, actorRole: 'LEARNER',
      action: 'INVITATION_OVERRUN', targetType: 'CommunityInvitation', targetId: invitationId,
      meta: {
        communityId: invitation.communityId,
        usesCount: invitation.usesCount, maxUses: invitation.maxUses,
      },
    })
    return { consumed: false, overrun: true }
  }

  await audit(tx, {
    actorId: learnerId, actorRole: 'LEARNER',
    action: 'INVITATION_ACCEPTED', targetType: 'CommunityInvitation', targetId: invitationId,
    meta: { communityId: invitation.communityId, grant: 'PAID' },
  })
  return { consumed: true, overrun: false }
}

// --- Rattachement au compte qui vient de naître (arbitrage 85) ---------------

/**
 * À la création d'un compte, les invitations nominatives en attente adressées à
 * cette adresse deviennent visibles dans NKAMVA. C'est une **lecture, pas une
 * acceptation** : adhérer, même gratuitement, reste un geste de l'invité.
 *
 * Sans cela, l'invité qui ferme son onglet au mauvais moment n'a plus qu'un
 * e-mail à retrouver — et le formateur voit une invitation « envoyée, jamais
 * acceptée » sans comprendre pourquoi.
 *
 * ⚠️ Le lien de la notification ne peut pas porter le jeton : il n'est pas
 * restituable pour un nominatif. Il mène à l'accueil, où la carte d'invitation
 * reprend le fil.
 */
export async function notifyPendingInvitationsForNewAccount(userId: string, email: string): Promise<number> {
  const normalized = email.trim().toLowerCase()
  const pending = await db.communityInvitation.findMany({
    where: {
      email: normalized, kind: 'NOMINATIVE',
      acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() },
    },
    select: {
      id: true, grant: true, giftMonths: true,
      community: { select: { name: true, status: true } },
    },
  })

  const live = pending.filter((p) => p.community.status === 'active')
  for (const invitation of live) {
    await deliverSideEffects('INVITATION_RECEIVED', { type: 'CommunityInvitation', id: invitation.id }, () =>
      notify(userId, {
        type: 'INVITATION_RECEIVED',
        title: `Une invitation vous attend dans ${invitation.community.name}`,
        body: invitation.grant === 'GIFT'
          ? `${invitation.giftMonths} mois offerts. Ouvrez le lien reçu par e-mail pour l'accepter.`
          : 'Ouvrez le lien reçu par e-mail pour rejoindre la communauté.',
        link: '/accueil',
      }),
    )
  }
  return live.length
}

// --- E-mail -----------------------------------------------------------------

interface InvitationEmailParams {
  to: string
  community: { name: string; priceFcfa: number }
  grant: InvitationGrant
  giftMonths: number | null
  url: string
  expiresAt: Date
  trainerName: string | null
}

/**
 * L'e-mail d'invitation. Sa dernière phrase n'est pas une politesse : le
 * destinataire n'a rien demandé et n'a peut-être aucun compte (arbitrage 80).
 * Lui dire qu'aucun compte n'a été créé, et d'où vient son adresse, est le
 * minimum dû à quelqu'un qu'on sollicite sans son accord préalable.
 *
 * **C'est le seul des cinq e-mails de F12.5 qui ne passe pas par
 * `notifyWithEmail`, et c'est voulu.** Le canal unique écrit d'abord une
 * notification in-app, donc il lui faut un `userId` — or on écrit ici à une
 * adresse, pour quelqu'un qui n'a précisément pas encore de compte. C'est aussi
 * pourquoi F12.5 range l'invitation « hors préférence » : il n'existe aucun
 * réglage à consulter, et l'envoi est systématique. Ne pas « uniformiser » ceci.
 */
export async function sendInvitationEmail(params: InvitationEmailParams): Promise<void> {
  const who = params.trainerName ?? 'Un formateur'
  const deadline = params.expiresAt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  const offer = params.grant === 'GIFT'
    ? `${params.giftMonths} mois d'adhésion vous sont offerts : vous n'avez rien à régler, et rien ne vous sera prélevé ensuite.`
    : `L'adhésion à cette communauté est de ${fmtFcfa(params.community.priceFcfa)} par mois.`

  const { html, text } = renderSimpleEmail({
    title: `${who} vous invite dans ${params.community.name}`,
    paragraphs: ['Bonjour,', `${who} vous invite à rejoindre sa communauté ${params.community.name} sur NKAMVA.`, offer],
    cta: { label: 'Voir l\'invitation', url: params.url },
    footnote:
      `Cette invitation expire le ${deadline}. Vous recevez cet e-mail parce que ${who} a saisi votre adresse : `
      + 'si cela ne vous dit rien, ignorez-le, aucun compte n\'a été créé à votre nom.',
  })

  await sendEmail({
    to: params.to,
    subject: `${who} vous invite dans ${params.community.name} sur NKAMVA`,
    html,
    text,
    tags: ['invitation'],
  })
}

// --- Purge RGPD (arbitrage 80) ----------------------------------------------

/**
 * Vide l'adresse des invitations terminales de plus de 90 jours. La ligne
 * survit : elle porte l'attribution d'adhésions bien réelles, et l'effacer
 * casserait un chaînage financier pour effacer une donnée qu'il suffit de
 * neutraliser.
 *
 * Idempotent par le filtre `anonymizedAt: null` : rejouer le job ne retouche
 * rien.
 */
export async function purgeStaleInvitations(now = new Date()): Promise<{ anonymized: number }> {
  const deadline = new Date(now.getTime() - INVITATION_RETENTION_DAYS * DAY_MS)

  const stale = await db.communityInvitation.findMany({
    where: {
      email: { not: null },
      anonymizedAt: null,
      kind: 'NOMINATIVE',
      OR: [
        { acceptedAt: { lte: deadline } },
        { revokedAt: { lte: deadline } },
        { expiresAt: { lte: deadline } },
      ],
    },
    select: { id: true, communityId: true },
  })

  for (const invitation of stale) {
    await db.$transaction(async (tx) => {
      // `updateMany` gardé sur l'index partiel : deux invitations anonymisées
      // vers la même communauté auraient toutes deux `email` nul, ce que
      // l'unicité partielle tolère (elle ne porte que sur les lignes ouvertes,
      // et une invitation terminale n'en est pas).
      await tx.communityInvitation.updateMany({
        where: { id: invitation.id, anonymizedAt: null },
        data: { email: null, anonymizedAt: now },
      })
      await audit(tx, {
        actorId: null, actorRole: 'SYSTEM',
        action: 'INVITATION_ANONYMIZED', targetType: 'CommunityInvitation', targetId: invitation.id,
        meta: { communityId: invitation.communityId },
      })
    })
  }

  if (stale.length > 0) {
    await auditStandalone({
      action: 'INVITATION_PURGE_COMPLETED', targetType: 'CommunityInvitation', targetId: null,
      meta: { anonymized: stale.length },
    })
  }

  return { anonymized: stale.length }
}
