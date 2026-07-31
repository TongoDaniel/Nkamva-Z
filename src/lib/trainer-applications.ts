// ==========================================================================
// Lot 1 — Validation des formateurs : machine à états TrainerApplication
// (T1-T8). Documents : voir trainer-documents.ts.
// ==========================================================================

import { db } from './db'
import { audit, auditStandalone } from './audit'
import { notify, notifyAdminSubRole } from './notification'
import { sendEmail } from './email'
import { presignDownload } from './s3'
import type { TrainerApplicationStatus } from '@prisma/client'

export const REOPEN_MIN_DELAY_HOURS = 24

const REQUIRED_DOCUMENT_TYPES = ['ID_CARD', 'DIPLOMA', 'VIDEO'] as const

export const TRAINER_APPLICATION_ERRORS: Record<string, { status: number; message: string }> = {
  USER_NOT_FOUND: { status: 404, message: 'Utilisateur introuvable' },
  ALREADY_TRAINER: { status: 403, message: 'Utilisateur déjà formateur' },
  APPLICATION_EXISTS: { status: 409, message: 'Candidature déjà en cours' },
  APPLICATION_NOT_FOUND: { status: 404, message: 'Candidature introuvable' },
  FORBIDDEN: { status: 403, message: 'Accès refusé' },
  INVALID_APPLICATION_STATUS: { status: 409, message: 'Statut de candidature invalide pour cette action' },
  DOCUMENTS_NOT_READY: { status: 422, message: 'Les 3 documents doivent être confirmés' },
  NO_DOCUMENTS_TARGETED: { status: 400, message: 'Aucun document ciblé' },
  DOCUMENT_NOT_FOUND: { status: 404, message: 'Document introuvable' },
  MAX_RESUBMISSIONS_REACHED: { status: 422, message: '3 re-soumissions atteintes' },
  STALE_APPLICATION: { status: 409, message: 'Dossier modifié par un autre admin' },
  REOPEN_IMPOSSIBLE: { status: 409, message: 'Réouverture impossible' },
}

// --- T1 : créer une candidature brouillon ---

export async function createApplication(userId: string): Promise<{ id: string }> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (!user) throw new Error('USER_NOT_FOUND')
  if (user.role === 'TRAINER') throw new Error('ALREADY_TRAINER')

  const existing = await db.trainerApplication.findFirst({
    where: { userId, status: { in: ['DRAFT', 'SUBMITTED', 'RESUBMISSION_PENDING', 'APPROVED'] } },
  })
  if (existing) throw new Error('APPLICATION_EXISTS')

  const application = await db.trainerApplication.create({ data: { userId, status: 'DRAFT' } })
  await auditStandalone({ actorId: userId, actorRole: 'LEARNER', action: 'TRAINER_APPLICATION_CREATED', targetType: 'TrainerApplication', targetId: application.id, meta: {} })
  return { id: application.id }
}

// --- Résoudre la candidature "en cours" du formateur (pour /me/documents/*, /me/submit) ---

export async function getActiveApplicationForUser(userId: string) {
  const application = await db.trainerApplication.findFirst({
    where: { userId, status: { in: ['DRAFT', 'RESUBMISSION_PENDING'] } },
    orderBy: { createdAt: 'desc' },
  })
  if (!application) throw new Error('APPLICATION_NOT_FOUND')
  return application
}

// --- Récupérer sa candidature ---

export async function getMyApplication(userId: string) {
  return db.trainerApplication.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { documents: { where: { isCurrent: true } } },
  })
}

// --- T2 : soumettre (3 documents confirmés) ---

export async function submitApplication(applicationId: string, userId: string): Promise<void> {
  const application = await db.trainerApplication.findUnique({
    where: { id: applicationId },
    include: { documents: { where: { isCurrent: true } } },
  })
  if (!application) throw new Error('APPLICATION_NOT_FOUND')
  if (application.userId !== userId) throw new Error('FORBIDDEN')
  if (application.status !== 'DRAFT') throw new Error('INVALID_APPLICATION_STATUS')

  for (const type of REQUIRED_DOCUMENT_TYPES) {
    const doc = application.documents.find(d => d.type === type)
    if (!doc || !['PENDING', 'RESUBMITTED'].includes(doc.status)) throw new Error('DOCUMENTS_NOT_READY')
  }

  await db.$transaction(async (tx) => {
    await tx.trainerApplication.update({ where: { id: applicationId }, data: { status: 'SUBMITTED', submittedAt: new Date() } })
    await tx.user.update({ where: { id: userId }, data: { role: 'PENDING_TRAINER', sessionsValidAfter: new Date() } })
    await audit(tx, { actorId: userId, actorRole: 'LEARNER', action: 'TRAINER_APPLICATION_SUBMITTED', targetType: 'TrainerApplication', targetId: applicationId, meta: {} })
  })

  await notifyAdminSubRole('MODERATION', {
    type: 'TRAINER_APPLICATION_SUBMITTED', title: 'Nouvelle candidature formateur',
    body: 'Une candidature formateur est prête à être validée.', link: `/admin/validation-formateurs/${applicationId}`,
  })
}

// --- Admin : liste, stats, détail ---

export async function listApplications(queue: 'pending' | 'approved' | 'rejected', page = 1, pageSize = 20) {
  const status: { in: TrainerApplicationStatus[] } = queue === 'pending' ? { in: ['SUBMITTED', 'RESUBMISSION_PENDING'] }
    : queue === 'approved' ? { in: ['APPROVED'] } : { in: ['REJECTED'] }

  const [items, total] = await Promise.all([
    db.trainerApplication.findMany({
      where: { status },
      include: {
        user: { select: { id: true, fullName: true, email: true, countryCode: true } },
        documents: { where: { isCurrent: true }, select: { id: true, type: true, status: true } },
      },
      orderBy: { submittedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.trainerApplication.count({ where: { status } }),
  ])
  return { items, total, page, pageSize }
}

export async function getApplicationStats() {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [pending, approvedThisMonth, rejectedThisMonth, decidedThisMonth] = await Promise.all([
    db.trainerApplication.count({ where: { status: { in: ['SUBMITTED', 'RESUBMISSION_PENDING'] } } }),
    db.trainerApplication.count({ where: { status: 'APPROVED', approvedAt: { gte: monthStart } } }),
    db.trainerApplication.count({ where: { status: 'REJECTED', rejectedAt: { gte: monthStart } } }),
    db.trainerApplication.findMany({
      where: { OR: [{ status: 'APPROVED', approvedAt: { gte: monthStart } }, { status: 'REJECTED', rejectedAt: { gte: monthStart } }] },
      select: { submittedAt: true, approvedAt: true, rejectedAt: true },
    }),
  ])

  const durations = decidedThisMonth
    .filter(a => a.submittedAt)
    .map(a => ((a.approvedAt || a.rejectedAt)!.getTime() - a.submittedAt!.getTime()) / 86400000)
  const avgProcessingDays = durations.length ? Math.round((durations.reduce((s, d) => s + d, 0) / durations.length) * 10) / 10 : 0

  return { pending, approvedThisMonth, rejectedThisMonth, avgProcessingDays }
}

export async function getApplicationDetail(applicationId: string) {
  const application = await db.trainerApplication.findUnique({
    where: { id: applicationId },
    include: {
      user: { select: { id: true, fullName: true, email: true, countryCode: true } },
      documents: { where: { isCurrent: true } },
    },
  })
  if (!application) throw new Error('APPLICATION_NOT_FOUND')

  const documents = await Promise.all(application.documents.map(async d => ({
    ...d, downloadUrl: d.status === 'AWAITING_UPLOAD' ? null : await presignDownload(d.s3Key),
  })))

  return { ...application, documents }
}

// --- T3 : approuver (crée TrainerProfile + Wallet, User → TRAINER) ---

export async function approveApplication(
  applicationId: string, adminId: string, expectedUpdatedAt: Date, verifiedLegalName: string,
): Promise<void> {
  const application = await db.trainerApplication.findUnique({
    where: { id: applicationId }, include: { documents: { where: { isCurrent: true } } },
  })
  if (!application) throw new Error('APPLICATION_NOT_FOUND')
  if (application.status !== 'SUBMITTED') throw new Error('INVALID_APPLICATION_STATUS')

  for (const type of REQUIRED_DOCUMENT_TYPES) {
    const doc = application.documents.find(d => d.type === type)
    if (!doc || !['PENDING', 'RESUBMITTED'].includes(doc.status)) throw new Error('DOCUMENTS_NOT_READY')
  }

  await db.$transaction(async (tx) => {
    const res = await tx.trainerApplication.updateMany({
      where: { id: applicationId, updatedAt: expectedUpdatedAt, status: 'SUBMITTED' },
      data: { status: 'APPROVED', approvedAt: new Date() },
    })
    if (res.count === 0) throw new Error('STALE_APPLICATION')

    for (const doc of application.documents) {
      await tx.trainerDocument.update({ where: { id: doc.id }, data: { status: 'APPROVED', reviewedAt: new Date(), reviewedById: adminId } })
      await tx.trainerDocumentReviewEvent.create({ data: { documentId: doc.id, fromStatus: doc.status, toStatus: 'APPROVED', actorId: adminId } })
    }

    const profile = await tx.trainerProfile.create({
      data: {
        userId: application.userId, verifiedLegalName,
        slogan: application.slogan, description: application.description,
        websiteUrl: application.websiteUrl, domains: application.domains, experienceYears: application.experienceYears,
        approvedAt: new Date(),
      },
    })
    await tx.wallet.create({ data: { trainerId: profile.id, balance: 0 } })
    await tx.user.update({ where: { id: application.userId }, data: { role: 'TRAINER', sessionsValidAfter: new Date() } })

    await tx.trainerApplicationReviewEvent.create({ data: { applicationId, fromStatus: 'SUBMITTED', toStatus: 'APPROVED', actorId: adminId } })
    await audit(tx, { actorId: adminId, actorRole: 'MODERATION', action: 'TRAINER_APPLICATION_APPROVED', targetType: 'TrainerApplication', targetId: applicationId, meta: { trainerProfileId: profile.id } })
  })

  const user = await db.user.findUnique({ where: { id: application.userId }, select: { email: true } })
  if (user) await sendEmail({ to: user.email, subject: 'Votre candidature formateur est approuvée', html: `<p>Félicitations, votre candidature formateur a été approuvée.</p>` })
  await notify(application.userId, { type: 'TRAINER_APPLICATION_APPROVED', title: 'Candidature approuvée', body: 'Votre candidature formateur a été approuvée.' })
}

// --- T4 : rejet partiel (documents ciblés) ---

export interface DocumentRejection { documentId: string; reason: string }

export async function rejectDocumentsPartial(
  applicationId: string, adminId: string, expectedUpdatedAt: Date, rejections: DocumentRejection[],
): Promise<void> {
  if (rejections.length === 0) throw new Error('NO_DOCUMENTS_TARGETED')

  const application = await db.trainerApplication.findUnique({
    where: { id: applicationId }, include: { documents: { where: { isCurrent: true } } },
  })
  if (!application) throw new Error('APPLICATION_NOT_FOUND')
  if (application.status !== 'SUBMITTED') throw new Error('INVALID_APPLICATION_STATUS')

  const targets = rejections.map(r => {
    const doc = application.documents.find(d => d.id === r.documentId)
    if (!doc) throw new Error('DOCUMENT_NOT_FOUND')
    if (doc.resubmissionCount >= 3) throw new Error('MAX_RESUBMISSIONS_REACHED')
    return { doc, reason: r.reason }
  })

  await db.$transaction(async (tx) => {
    const res = await tx.trainerApplication.updateMany({
      where: { id: applicationId, updatedAt: expectedUpdatedAt, status: 'SUBMITTED' },
      data: { status: 'RESUBMISSION_PENDING' },
    })
    if (res.count === 0) throw new Error('STALE_APPLICATION')

    for (const { doc, reason } of targets) {
      await tx.trainerDocument.update({ where: { id: doc.id }, data: { status: 'REJECTED', rejectionReason: reason, reviewedAt: new Date(), reviewedById: adminId } })
      await tx.trainerDocumentReviewEvent.create({ data: { documentId: doc.id, fromStatus: doc.status, toStatus: 'REJECTED', actorId: adminId, rejectionReason: reason } })
    }

    await tx.trainerApplicationReviewEvent.create({
      data: { applicationId, fromStatus: 'SUBMITTED', toStatus: 'RESUBMISSION_PENDING', actorId: adminId, rejectedDocIds: targets.map(t => t.doc.id) },
    })
    await audit(tx, { actorId: adminId, actorRole: 'MODERATION', action: 'TRAINER_APPLICATION_DOCUMENTS_REJECTED', targetType: 'TrainerApplication', targetId: applicationId, meta: { documentIds: targets.map(t => t.doc.id) } })
  })

  const user = await db.user.findUnique({ where: { id: application.userId }, select: { email: true } })
  const reasons = targets.map(t => `${t.doc.type} : ${t.reason}`).join(' — ')
  if (user) await sendEmail({ to: user.email, subject: 'Pièces à re-soumettre pour votre candidature formateur', html: `<p>${reasons}</p>` })
  await notify(application.userId, { type: 'TRAINER_APPLICATION_DOCUMENTS_REJECTED', title: 'Pièces à re-soumettre', body: reasons })
}

// --- T6/T7 : rejet définitif ---

export async function rejectApplicationFinal(
  applicationId: string, adminId: string, expectedUpdatedAt: Date, reason: string,
): Promise<void> {
  const application = await db.trainerApplication.findUnique({ where: { id: applicationId } })
  if (!application) throw new Error('APPLICATION_NOT_FOUND')
  if (!['SUBMITTED', 'RESUBMISSION_PENDING'].includes(application.status)) throw new Error('INVALID_APPLICATION_STATUS')

  await db.$transaction(async (tx) => {
    const res = await tx.trainerApplication.updateMany({
      where: { id: applicationId, updatedAt: expectedUpdatedAt, status: application.status },
      data: { status: 'REJECTED', rejectedAt: new Date(), finalRejectionReason: reason },
    })
    if (res.count === 0) throw new Error('STALE_APPLICATION')

    await tx.user.update({ where: { id: application.userId }, data: { role: 'LEARNER', sessionsValidAfter: new Date() } })
    await tx.trainerApplicationReviewEvent.create({ data: { applicationId, fromStatus: application.status, toStatus: 'REJECTED', actorId: adminId, reason } })
    await audit(tx, { actorId: adminId, actorRole: 'MODERATION', action: 'TRAINER_APPLICATION_REJECTED', targetType: 'TrainerApplication', targetId: applicationId, meta: { reason } })
  })

  const user = await db.user.findUnique({ where: { id: application.userId }, select: { email: true } })
  if (user) await sendEmail({ to: user.email, subject: 'Votre candidature formateur a été rejetée', html: `<p>${reason}</p>` })
  await notify(application.userId, { type: 'TRAINER_APPLICATION_REJECTED', title: 'Candidature rejetée', body: reason })
}

// --- T8 : réouverture (Super-admin uniquement) ---

export async function reopenApplication(applicationId: string, superAdminId: string): Promise<void> {
  const application = await db.trainerApplication.findUnique({
    where: { id: applicationId }, include: { documents: true },
  })
  if (!application) throw new Error('APPLICATION_NOT_FOUND')
  if (application.status !== 'REJECTED') throw new Error('REOPEN_IMPOSSIBLE')
  if (application.reopenedById) throw new Error('REOPEN_IMPOSSIBLE')
  if (!application.rejectedAt || application.rejectedAt > new Date(Date.now() - REOPEN_MIN_DELAY_HOURS * 3600000)) throw new Error('REOPEN_IMPOSSIBLE')
  if (application.documents.some(d => d.purgedAt)) throw new Error('REOPEN_IMPOSSIBLE')

  await db.$transaction(async (tx) => {
    const res = await tx.trainerApplication.updateMany({
      where: { id: applicationId, status: 'REJECTED', reopenedById: null },
      data: { status: 'RESUBMISSION_PENDING', reopenedById: superAdminId, reopenedAt: new Date() },
    })
    if (res.count === 0) throw new Error('REOPEN_IMPOSSIBLE')

    await tx.user.update({ where: { id: application.userId }, data: { role: 'PENDING_TRAINER', sessionsValidAfter: new Date() } })
    await tx.trainerApplicationReviewEvent.create({ data: { applicationId, fromStatus: 'REJECTED', toStatus: 'RESUBMISSION_PENDING', actorId: superAdminId } })
    await audit(tx, { actorId: superAdminId, actorRole: 'SUPER_ADMIN', action: 'TRAINER_APPLICATION_REOPENED', targetType: 'TrainerApplication', targetId: applicationId, meta: {} })
  })

  await notify(application.userId, { type: 'TRAINER_APPLICATION_REOPENED', title: 'Candidature réouverte', body: 'Votre dossier a été réouvert, vous pouvez re-soumettre vos pièces.' })
}
