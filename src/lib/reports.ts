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
      return user
        ? { label: user.fullName ?? user.email, href: null, exists: true }
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
    case 'DISPUTE_MESSAGE': {
      const message = await db.disputeMessage.findUnique({
        where: { id: targetId },
        select: { id: true, disputeId: true, body: true },
      })
      return message
        ? {
            label: `Message de litige — « ${message.body.slice(0, 60)}${message.body.length > 60 ? '…' : ''} »`,
            href: `/admin/litiges/${message.disputeId}`,
            exists: true,
          }
        : { label: 'Message introuvable', href: null, exists: false }
    }
    case 'MESSAGE':
      // La messagerie n'est pas modélisée (arbitrage 33) : aucun signalement
      // ne peut encore en produire, mais le type existe pour ne pas avoir à
      // migrer le jour où elle arrivera.
      return { label: 'Message de la messagerie (non encore modélisée)', href: null, exists: false }
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

export interface ResolveReportInput {
  status: Extract<ReportStatus, 'UPHELD' | 'DISMISSED'>
  decisionNote: string
  /** Retirer la ressource du catalogue. Seul `COURSE` le permet. */
  hideTarget?: boolean
  actorId: string
  actorRole: string
  expectedUpdatedAt: string
}

export async function resolveReport(reportId: string, input: ResolveReportInput) {
  const report = await db.report.findUnique({ where: { id: reportId } })
  if (!report) throw new Error('REPORT_NOT_FOUND')
  if (report.status !== 'OPEN') throw new Error('REPORT_NOT_OPEN')

  const hide = input.hideTarget === true
  if (hide && report.targetType !== 'COURSE') throw new Error('TARGET_NOT_HIDEABLE')

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
      // Retirer du catalogue, pas supprimer : les acheteurs gardent leur
      // accès, l'achat est définitif.
      await tx.course.update({ where: { id: report.targetId }, data: { status: 'archived' } })
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
