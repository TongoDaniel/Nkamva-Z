// ==========================================================================
// Signalements — décision 7 (périmètre Modération)
// ==========================================================================
// Un modèle générique pour toutes les surfaces : la Modération doit pouvoir
// répondre à « montre-moi tout ce qui est signalé », ce qu'une table par
// surface interdit.
//
// La sanction retenue est **le retrait du catalogue** (`Course.status` →
// `archived`). Les acheteurs gardent leur accès : l'achat est définitif, et
// retirer une ressource ne rembourse personne — c'est un litige qui le fait
// (Lot 2), pas un signalement.
// ==========================================================================

import type { ReportReason, ReportStatus, ReportTargetType } from '@prisma/client'
import { db } from './db'
import { audit } from './audit'
import { notify, notifyAdminSubRole, deliverSideEffects } from './notification'

export interface CreateReportInput {
  targetType: ReportTargetType
  targetId: string
  reason: ReportReason
  detail?: string | null
}

export async function createReport(reporterId: string, input: CreateReportInput) {
  // Un même compte ne signale pas deux fois le même objet : la Modération
  // instruirait deux fois la même chose, et le compteur mentirait sur
  // l'ampleur réelle.
  const existing = await db.report.findFirst({
    where: { reporterId, targetType: input.targetType, targetId: input.targetId, status: 'OPEN' },
    select: { id: true },
  })
  if (existing) throw new Error('REPORT_ALREADY_OPEN')

  const report = await db.$transaction(async (tx) => {
    const created = await tx.report.create({
      data: {
        reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        detail: input.detail ?? null,
      },
    })
    await audit(tx, {
      actorId: reporterId, actorRole: 'LEARNER',
      action: 'REPORT_CREATED', targetType: 'Report', targetId: created.id,
      meta: { targetType: input.targetType, targetId: input.targetId, reason: input.reason },
    })
    return created
  })

  await deliverSideEffects('REPORT_CREATED', { type: 'Report', id: report.id }, () =>
    notifyAdminSubRole('MODERATION', {
      type: 'REPORT_TO_REVIEW',
      title: 'Nouveau signalement',
      body: `${input.targetType} — motif ${input.reason}.`,
      link: `/admin/signalements/${report.id}`,
    }),
  )

  return report
}

export async function listReports(filters: {
  status?: ReportStatus
  targetType?: ReportTargetType
  page?: number
  pageSize?: number
} = {}) {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(filters.pageSize ?? 20, 50)

  const where = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.targetType ? { targetType: filters.targetType } : {}),
  }

  const [items, total] = await Promise.all([
    db.report.findMany({
      where,
      include: { reporter: { select: { id: true, email: true, fullName: true } } },
      // Les plus anciens d'abord : on instruit dans l'ordre d'arrivée, comme
      // les candidatures et les litiges.
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.report.count({ where }),
  ])

  return { items, total, page, pageSize }
}

export interface ReportTargetSummary {
  label: string
  /** Lien interne quand la cible a un écran ; `null` sinon. */
  href: string | null
  /** La cible existe-t-elle encore ? Un objet supprimé reste signalé. */
  exists: boolean
  /** Renseigné pour COURSE : permet de savoir si elle est déjà retirée. */
  courseStatus?: string
  /**
   * La cible est-elle déjà retirée ? Vrai pour un message effacé de son fil.
   * Distinct de `exists` : la ligne est là, la Modération peut la lire, mais
   * plus personne d'autre ne la voit — la retirer une seconde fois n'a pas de
   * sens.
   */
  removed?: boolean
}

/**
 * Ce que la Modération lit dans la file : assez pour reconnaître le message
 * signalé, pas assez pour transformer la liste en fil de discussion.
 */
function excerpt(body: string, max = 60): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  return `« ${flat.slice(0, max)}${flat.length > max ? '…' : ''} »`
}

/**
 * Résout la cible d'un signalement. `targetId` n'est pas une clé étrangère —
 * les cibles vivent dans des tables différentes et certaines n'existent pas
 * encore. Une cible introuvable n'est donc pas une erreur : c'est un état, et
 * la Modération doit le voir plutôt que buter sur une page cassée.
 */
export async function resolveReportTarget(
  targetType: ReportTargetType,
  targetId: string,
): Promise<ReportTargetSummary> {
  switch (targetType) {
    case 'COURSE': {
      const course = await db.course.findUnique({
        where: { id: targetId },
        select: { id: true, title: true, slug: true, status: true },
      })
      return course
        ? { label: course.title, href: `/ressources/${course.slug}`, exists: true, courseStatus: course.status }
        : { label: 'Ressource supprimée', href: null, exists: false }
    }
    case 'USER': {
      const user = await db.user.findUnique({
        where: { id: targetId },
        select: { id: true, email: true, fullName: true },
      })
      // Pas de lien, et ce n'est pas un oubli : décision 7, la Modération n'a
      // pas accès à l'annuaire des utilisateurs — `/admin/utilisateurs` la
      // renverrait sur `/admin`. Le libellé porte donc de quoi identifier le
      // compte sans le consulter, nom **et** adresse : le Super-admin saisi du
      // dossier ne doit pas avoir à deviner qui est visé.
      return user
        ? {
            label: user.fullName ? `${user.fullName} — ${user.email}` : user.email,
            href: null,
            exists: true,
          }
        : { label: 'Compte introuvable', href: null, exists: false }
    }
    case 'COMMUNITY': {
      const community = await db.community.findUnique({
        where: { id: targetId },
        select: { id: true, name: true, slug: true },
      })
      return community
        ? { label: community.name, href: `/communautes/${community.slug}`, exists: true }
        : { label: 'Communauté introuvable', href: null, exists: false }
    }
    case 'COMMUNITY_POST': {
      const post = await db.communityPost.findUnique({
        where: { id: targetId },
        select: { id: true, body: true, deletedAt: true, community: { select: { slug: true, name: true } } },
      })
      // Un billet déjà retiré du fil reste instruisible : `exists` dit qu'on
      // sait de quoi il s'agit, pas qu'il est encore visible des membres.
      return post
        ? {
            label: `Billet de « ${post.community.name} » — ${excerpt(post.body)}`,
            href: `/communautes/${post.community.slug}`,
            exists: true,
            removed: post.deletedAt !== null,
          }
        : { label: 'Billet supprimé', href: null, exists: false }
    }
    case 'COMMUNITY_POST_REPLY': {
      const reply = await db.communityPostReply.findUnique({
        where: { id: targetId },
        select: {
          id: true, body: true, deletedAt: true,
          post: { select: { community: { select: { slug: true, name: true } } } },
        },
      })
      return reply
        ? {
            label: `Réponse dans « ${reply.post.community.name} » — ${excerpt(reply.body)}`,
            href: `/communautes/${reply.post.community.slug}`,
            exists: true,
            removed: reply.deletedAt !== null,
          }
        : { label: 'Réponse supprimée', href: null, exists: false }
    }
    case 'LIVE_MESSAGE': {
      const message = await db.liveMessage.findUnique({
        where: { id: targetId },
        select: {
          id: true, body: true, deletedAt: true,
          session: { select: { id: true, title: true } },
        },
      })
      // Pas de lien non plus : le salon vit dans l'écran de la séance, réservé
      // aux membres de la communauté. Le titre de la séance situe le propos.
      return message
        ? {
            label: `Salon live « ${message.session.title} » — ${excerpt(message.body)}`,
            href: null,
            exists: true,
            removed: message.deletedAt !== null,
          }
        : { label: 'Message introuvable', href: null, exists: false }
    }
    case 'DISPUTE_MESSAGE': {
      const message = await db.disputeMessage.findUnique({
        where: { id: targetId },
        select: { id: true, disputeId: true, body: true },
      })
      return message
        ? {
            label: `Message de litige — ${excerpt(message.body)}`,
            href: `/admin/litiges/${message.disputeId}`,
            exists: true,
          }
        : { label: 'Message introuvable', href: null, exists: false }
    }
    case 'MESSAGE': {
      // La messagerie existe désormais (arbitrage 33) : le commentaire qui
      // disait le contraire faisait passer tout signalement de message pour
      // une cible inexistante, que la Modération n'avait plus qu'à rejeter.
      const message = await db.message.findUnique({
        where: { id: targetId },
        select: {
          id: true, body: true, deletedAt: true,
          conversation: { select: { community: { select: { name: true } } } },
        },
      })
      // Aucun `href` : un fil 1 à 1 n'a pas d'écran d'administration, et lui en
      // ouvrir un donnerait à la Modération la correspondance entière quand
      // elle n'instruit qu'un message.
      return message
        ? {
            label: `Message privé (${message.conversation.community.name}) — ${excerpt(message.body)}`,
            href: null,
            exists: true,
            removed: message.deletedAt !== null,
          }
        : { label: 'Message introuvable', href: null, exists: false }
    }
  }
}

export async function getReportDetail(reportId: string) {
  const report = await db.report.findUnique({
    where: { id: reportId },
    include: {
      reporter: { select: { id: true, email: true, fullName: true } },
      reviewedBy: { select: { id: true, email: true, fullName: true } },
    },
  })
  if (!report) throw new Error('REPORT_NOT_FOUND')

  const target = await resolveReportTarget(report.targetType, report.targetId)
  // Les autres signalements sur le même objet : trois plaintes sur la même
  // ressource ne se jugent pas comme une seule.
  const siblings = await db.report.count({
    where: { targetType: report.targetType, targetId: report.targetId, id: { not: report.id } },
  })

  return { ...report, target, siblingCount: siblings }
}

export async function getReportStats() {
  const [byStatus, byTarget] = await Promise.all([
    db.report.groupBy({ by: ['status'], _count: { _all: true } }),
    db.report.groupBy({ by: ['targetType'], where: { status: 'OPEN' }, _count: { _all: true } }),
  ])
  const counts = Object.fromEntries(byStatus.map(r => [r.status, r._count._all]))
  return {
    open: counts.OPEN ?? 0,
    upheld: counts.UPHELD ?? 0,
    dismissed: counts.DISMISSED ?? 0,
    openByTarget: Object.fromEntries(byTarget.map(r => [r.targetType, r._count._all])),
  }
}

/**
 * Les cibles sur lesquelles la clôture peut agir, et ce qu'agir veut dire pour
 * chacune. Le geste n'est pas le même partout : une ressource sort du
 * catalogue en gardant ses acheteurs, un message sort du fil en gardant sa
 * ligne. Aucune ne disparaît.
 *
 * Trois cibles restent volontairement absentes :
 * — `USER`, parce que sanctionner un compte est réservé au Super-admin
 *   (décision 7 : la Modération n'a pas l'annuaire) ;
 * — `COMMUNITY`, parce que fermer une communauté coupe des adhésions payées et
 *   ne se décide pas depuis un signalement ;
 * — `DISPUTE_MESSAGE`, parce qu'un dossier de litige est une pièce
 *   d'instruction : en retirer un message trouerait la chronologie que le
 *   support et l'acheteur doivent pouvoir relire.
 */
export const HIDEABLE_TARGET_TYPES: ReportTargetType[] = [
  'COURSE',
  'COMMUNITY_POST',
  'COMMUNITY_POST_REPLY',
  'MESSAGE',
  'LIVE_MESSAGE',
]

export interface ResolveReportInput {
  status: Extract<ReportStatus, 'UPHELD' | 'DISMISSED'>
  /** Retirer la cible : archivage pour une ressource, retrait du fil pour un message. */
  hideTarget?: boolean
  decisionNote: string
  actorId: string
  actorRole: string
  expectedUpdatedAt: string
}

export async function resolveReport(reportId: string, input: ResolveReportInput) {
  const report = await db.report.findUnique({ where: { id: reportId } })
  if (!report) throw new Error('REPORT_NOT_FOUND')
  if (report.status !== 'OPEN') throw new Error('REPORT_NOT_OPEN')

  const hide = input.hideTarget === true
  if (hide && !HIDEABLE_TARGET_TYPES.includes(report.targetType)) {
    throw new Error('TARGET_NOT_HIDEABLE')
  }

  const resolved = await db.$transaction(async (tx) => {
    const guard = await tx.report.updateMany({
      where: { id: reportId, status: 'OPEN', updatedAt: new Date(input.expectedUpdatedAt) },
      data: {
        status: input.status,
        decisionNote: input.decisionNote,
        targetHidden: hide,
        reviewedById: input.actorId,
        reviewedAt: new Date(),
      },
    })
    if (guard.count === 0) throw new Error('STALE_REPORT')

    if (hide) {
      const removal = { deletedAt: new Date(), deletedById: input.actorId }
      switch (report.targetType) {
        case 'COURSE':
          // Retirer du catalogue, pas supprimer : les acheteurs gardent leur
          // accès, l'achat est définitif.
          await tx.course.update({ where: { id: report.targetId }, data: { status: 'archived' } })
          break
        case 'COMMUNITY_POST':
          // `updateMany` et non `update` : la cible a pu être retirée par son
          // auteur pendant l'instruction, et un signalement ne doit pas
          // échouer parce que quelqu'un a été plus rapide que la Modération.
          await tx.communityPost.updateMany({
            where: { id: report.targetId, deletedAt: null },
            data: removal,
          })
          break
        case 'COMMUNITY_POST_REPLY': {
          const removed = await tx.communityPostReply.updateMany({
            where: { id: report.targetId, deletedAt: null },
            data: removal,
          })
          // `repliesCount` compte ce qui est encore lisible — même règle que
          // le retrait par l'animateur. Rien à décompter si la réponse était
          // déjà partie.
          if (removed.count > 0) {
            const reply = await tx.communityPostReply.findUnique({
              where: { id: report.targetId },
              select: { postId: true },
            })
            if (reply) {
              await tx.communityPost.update({
                where: { id: reply.postId },
                data: { repliesCount: { decrement: 1 } },
              })
            }
          }
          break
        }
        case 'MESSAGE':
          await tx.message.updateMany({
            where: { id: report.targetId, deletedAt: null },
            data: removal,
          })
          break
        case 'LIVE_MESSAGE':
          await tx.liveMessage.updateMany({
            where: { id: report.targetId, deletedAt: null },
            data: removal,
          })
          break
      }
    }

    await audit(tx, {
      actorId: input.actorId, actorRole: input.actorRole,
      action: input.status === 'UPHELD' ? 'REPORT_UPHELD' : 'REPORT_DISMISSED',
      targetType: 'Report', targetId: reportId,
      meta: { targetType: report.targetType, targetId: report.targetId, hidden: hide },
    })

    return tx.report.findUniqueOrThrow({ where: { id: reportId } })
  })

  await deliverSideEffects('REPORT_RESOLVED', { type: 'Report', id: reportId }, () =>
    notify(report.reporterId, {
      type: 'REPORT_RESOLVED',
      title: input.status === 'UPHELD' ? 'Votre signalement a été retenu' : 'Votre signalement a été examiné',
      body: input.decisionNote,
      link: '/notifications',
    }),
  )

  return resolved
}
