// ==========================================================================
// Lot 1 — Revue des candidatures formateur, côté administration
// ==========================================================================
// Transitions couvertes : T3 (approbation), T4 (rejet partiel des pièces),
// T6/T7 (rejet définitif), T8 (réouverture), et sur les pièces D2/D3/D5/D6.
//
// Toutes les décisions sensibles passent par un contrôle optimiste sur
// `expectedUpdatedAt` : deux modérateurs qui ouvrent le même dossier ne peuvent
// pas décider chacun de leur côté sans que le second soit averti.
// ==========================================================================

import type { TrainerApplicationStatus } from '@prisma/client'
import { db } from './db'
import { audit, auditStandalone } from './audit'
import { notify } from './notification'
import { sendEmail } from './email'
import { presignDownload } from './s3'
import {
  TrainerApplicationError,
  REOPEN_MIN_DELAY_HOURS,
  DOCUMENT_RETENTION_DAYS,
  MAX_RESUBMISSIONS,
} from './trainer-applications'

function fail(code: string): never {
  throw new TrainerApplicationError(code)
}

const REVIEWABLE: TrainerApplicationStatus[] = ['SUBMITTED', 'RESUBMISSION_PENDING']

function appUrl(path: string): string {
  const base = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || 'https://nkamva.com'
  return `${base}${path}`
}

// --- Listing et statistiques ---

export interface ListFilters {
  status?: TrainerApplicationStatus
  search?: string
  page: number
  pageSize: number
}

export async function listApplications(filters: ListFilters) {
  const where = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.search
      ? {
          user: {
            OR: [
              { email: { contains: filters.search, mode: 'insensitive' as const } },
              { fullName: { contains: filters.search, mode: 'insensitive' as const } },
            ],
          },
        }
      : {}),
  }

  const [items, total] = await Promise.all([
    db.trainerApplication.findMany({
      where,
      select: {
        id: true, status: true, slogan: true, domains: true, experienceYears: true,
        submittedAt: true, reviewedAt: true, approvedAt: true, rejectedAt: true,
        createdAt: true, updatedAt: true,
        user: { select: { id: true, email: true, fullName: true, countryCode: true } },
        documents: { where: { isCurrent: true }, select: { type: true, status: true } },
      },
      // Les dossiers soumis les plus anciens d'abord : on traite dans l'ordre
      // d'arrivée, pas dans l'ordre inverse.
      orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    db.trainerApplication.count({ where }),
  ])

  return { items, total, page: filters.page, pageSize: filters.pageSize }
}

export async function getApplicationStats() {
  const rows = await db.trainerApplication.groupBy({ by: ['status'], _count: { _all: true } })
  const count = (status: TrainerApplicationStatus) =>
    rows.find((r) => r.status === status)?._count._all ?? 0

  return {
    submitted: count('SUBMITTED'),
    resubmissionPending: count('RESUBMISSION_PENDING'),
    approved: count('APPROVED'),
    rejected: count('REJECTED'),
    draft: count('DRAFT'),
    total: rows.reduce((sum, r) => sum + r._count._all, 0),
  }
}

export async function getApplicationDetail(applicationId: string) {
  return db.trainerApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true, status: true, slogan: true, description: true, websiteUrl: true,
      domains: true, experienceYears: true, submittedAt: true, reviewedAt: true,
      finalRejectionReason: true, approvedAt: true, rejectedAt: true,
      reopenedAt: true, reopenedById: true, createdAt: true, updatedAt: true,
      user: {
        select: { id: true, email: true, fullName: true, countryCode: true, phone: true, createdAt: true },
      },
      documents: {
        where: { isCurrent: true },
        select: {
          id: true, type: true, status: true, rejectionReason: true, resubmissionCount: true,
          originalFileName: true, sizeBytes: true, mimeType: true, purgedAt: true, createdAt: true,
        },
        orderBy: { type: 'asc' },
      },
      reviewEvents: {
        select: { fromStatus: true, toStatus: true, reason: true, rejectedDocIds: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
}

// --- Garde de concurrence ---

async function loadForDecision(applicationId: string, expectedUpdatedAt: string) {
  const application = await db.trainerApplication.findUnique({
    where: { id: applicationId },
    select: { id: true, userId: true, status: true, updatedAt: true, slogan: true, description: true, websiteUrl: true, domains: true, experienceYears: true, rejectedAt: true, reopenedById: true },
  })
  if (!application) fail('APPLICATION_NOT_FOUND')
  if (application.updatedAt.toISOString() !== new Date(expectedUpdatedAt).toISOString()) {
    fail('STALE_APPLICATION')
  }
  return application
}

// --- T3 : approbation ---

export async function approveApplication(
  applicationId: string,
  adminId: string,
  params: { expectedUpdatedAt: string; verifiedLegalName: string; commissionRate?: number },
) {
  const application = await loadForDecision(applicationId, params.expectedUpdatedAt)
  if (application.status !== 'SUBMITTED') fail('APPLICATION_NOT_REVIEWABLE')

  const legalName = params.verifiedLegalName.trim()
  if (legalName.length < 2) fail('LEGAL_NAME_REQUIRED')

  const existingProfile = await db.trainerProfile.findUnique({
    where: { userId: application.userId },
    select: { id: true },
  })
  if (existingProfile) fail('ALREADY_TRAINER')

  const result = await db.$transaction(async (tx) => {
    const { count } = await tx.trainerApplication.updateMany({
      where: { id: applicationId, status: 'SUBMITTED', updatedAt: application.updatedAt },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        reviewedAt: new Date(),
        reviewedById: adminId,
      },
    })
    if (count === 0) fail('STALE_APPLICATION')

    // D2/D5 : la décision porte sur le dossier ; les pièces encore en attente
    // sont validées par la même occasion.
    await tx.trainerDocument.updateMany({
      where: { applicationId, isCurrent: true, status: { in: ['PENDING', 'RESUBMITTED'] } },
      data: { status: 'APPROVED', reviewedById: adminId, reviewedAt: new Date() },
    })

    const profile = await tx.trainerProfile.create({
      data: {
        userId: application.userId,
        verifiedLegalName: legalName,
        slogan: application.slogan,
        description: application.description,
        websiteUrl: application.websiteUrl,
        domains: application.domains,
        experienceYears: application.experienceYears,
        approvedAt: new Date(),
        ...(params.commissionRate !== undefined ? { commissionRate: params.commissionRate } : {}),
      },
      select: { id: true },
    })

    // Le portefeuille doit exister avant la première vente : le créer ici
    // évite de dépendre du filet de `creditWalletOnPurchase`.
    await tx.wallet.create({ data: { trainerId: profile.id, balance: 0 } })

    // Le rôle est relu en base à chaque requête : pas d'invalidation de session,
    // qui déconnecterait le formateur au moment de son admission.
    await tx.user.update({ where: { id: application.userId }, data: { role: 'TRAINER' } })

    await tx.trainerApplicationReviewEvent.create({
      data: { applicationId, fromStatus: 'SUBMITTED', toStatus: 'APPROVED', actorId: adminId },
    })
    await audit(tx, {
      actorId: adminId, actorRole: 'ADMIN',
      action: 'TRAINER_APPLICATION_APPROVED', targetType: 'TrainerApplication', targetId: applicationId,
      meta: { userId: application.userId, trainerId: profile.id, verifiedLegalName: legalName },
    })

    return profile
  })

  await notify(application.userId, {
    type: 'TRAINER_APPLICATION_APPROVED',
    title: 'Votre candidature est acceptée',
    body: 'Votre espace formateur est ouvert.',
    link: '/formateur',
  })
  await sendEmail({
    to: (await db.user.findUnique({ where: { id: application.userId }, select: { email: true } }))!.email,
    subject: 'Votre candidature formateur est acceptée — NkamVa',
    html: `<p>Bonne nouvelle : votre candidature est acceptée.</p><p>Votre espace formateur est ouvert, vous pouvez publier votre première ressource :<br><a href="${appUrl('/formateur')}">${appUrl('/formateur')}</a></p>`,
    text: `Votre candidature est acceptée. Ouvrez votre espace formateur : ${appUrl('/formateur')}`,
    tags: ['trainer-application'],
  })

  return { trainerId: result.id }
}

// --- T4 : rejet partiel des pièces ---

export async function rejectDocuments(
  applicationId: string,
  adminId: string,
  params: { expectedUpdatedAt: string; rejections: Array<{ documentId: string; reason: string }> },
) {
  const application = await loadForDecision(applicationId, params.expectedUpdatedAt)
  if (application.status !== 'SUBMITTED') fail('APPLICATION_NOT_REVIEWABLE')
  if (params.rejections.length === 0) fail('NO_DOCUMENT_REJECTED')

  const current = await db.trainerDocument.findMany({
    where: { applicationId, isCurrent: true },
    select: { id: true, type: true, status: true, resubmissionCount: true },
  })
  const currentIds = new Set(current.map((d) => d.id))
  for (const rejection of params.rejections) {
    if (!currentIds.has(rejection.documentId)) fail('DOCUMENT_NOT_FOUND')
    if (!rejection.reason.trim()) fail('REJECTION_REASON_REQUIRED')
  }

  // Une pièce déjà renvoyée au maximum ne peut plus l'être : le dossier n'a
  // alors plus d'issue par re-soumission, il faut trancher définitivement.
  const rejectedIds = new Set(params.rejections.map((r) => r.documentId))
  const exhausted = current.filter(
    (d) => rejectedIds.has(d.id) && d.resubmissionCount >= MAX_RESUBMISSIONS,
  )
  if (exhausted.length > 0) fail('MAX_RESUBMISSIONS_REACHED')

  await db.$transaction(async (tx) => {
    const { count } = await tx.trainerApplication.updateMany({
      where: { id: applicationId, status: 'SUBMITTED', updatedAt: application.updatedAt },
      data: { status: 'RESUBMISSION_PENDING', reviewedAt: new Date(), reviewedById: adminId },
    })
    if (count === 0) fail('STALE_APPLICATION')

    for (const rejection of params.rejections) {
      const document = current.find((d) => d.id === rejection.documentId)!
      await tx.trainerDocument.update({
        where: { id: rejection.documentId },
        data: {
          status: 'REJECTED',
          rejectionReason: rejection.reason.trim(),
          reviewedById: adminId,
          reviewedAt: new Date(),
        },
      })
      await tx.trainerDocumentReviewEvent.create({
        data: {
          documentId: rejection.documentId,
          fromStatus: document.status,
          toStatus: 'REJECTED',
          actorId: adminId,
          rejectionReason: rejection.reason.trim(),
        },
      })
    }

    // Les pièces non contestées sont acquises : le candidat n'a pas à les
    // redéposer, et elles ne doivent plus bloquer sa re-soumission.
    await tx.trainerDocument.updateMany({
      where: {
        applicationId,
        isCurrent: true,
        id: { notIn: [...rejectedIds] },
        status: { in: ['PENDING', 'RESUBMITTED'] },
      },
      data: { status: 'APPROVED', reviewedById: adminId, reviewedAt: new Date() },
    })

    await tx.trainerApplicationReviewEvent.create({
      data: {
        applicationId,
        fromStatus: 'SUBMITTED',
        toStatus: 'RESUBMISSION_PENDING',
        actorId: adminId,
        rejectedDocIds: [...rejectedIds],
      },
    })
    await audit(tx, {
      actorId: adminId, actorRole: 'ADMIN',
      action: 'TRAINER_DOCUMENTS_REJECTED', targetType: 'TrainerApplication', targetId: applicationId,
      meta: { rejectedCount: params.rejections.length },
    })
  })

  const user = await db.user.findUnique({ where: { id: application.userId }, select: { email: true } })
  await notify(application.userId, {
    type: 'TRAINER_DOCUMENTS_REJECTED',
    title: 'Des pièces sont à renvoyer',
    body: 'Votre candidature nécessite de nouvelles pièces.',
    link: '/candidature',
  })
  await sendEmail({
    to: user!.email,
    subject: 'Des pièces sont à renvoyer — NkamVa',
    html: `<p>L'examen de votre candidature demande de nouvelles pièces.</p><ul>${params.rejections
      .map((r) => `<li>${r.reason.trim()}</li>`)
      .join('')}</ul><p>Les pièces déjà validées sont conservées :<br><a href="${appUrl('/candidature')}">${appUrl('/candidature')}</a></p>`,
    text: `Des pièces sont à renvoyer :\n${params.rejections.map((r) => `- ${r.reason.trim()}`).join('\n')}\n\n${appUrl('/candidature')}`,
    tags: ['trainer-application'],
  })
}

// --- T6 / T7 : rejet définitif ---

export async function rejectApplicationFinal(
  applicationId: string,
  adminId: string,
  params: { expectedUpdatedAt: string; reason: string },
) {
  const application = await loadForDecision(applicationId, params.expectedUpdatedAt)
  if (!REVIEWABLE.includes(application.status)) fail('APPLICATION_NOT_REVIEWABLE')
  const reason = params.reason.trim()
  if (reason.length < 10) fail('REJECTION_REASON_REQUIRED')

  const from = application.status

  await db.$transaction(async (tx) => {
    const { count } = await tx.trainerApplication.updateMany({
      where: { id: applicationId, status: from, updatedAt: application.updatedAt },
      data: {
        status: 'REJECTED',
        rejectedAt: new Date(),
        reviewedAt: new Date(),
        reviewedById: adminId,
        finalRejectionReason: reason,
      },
    })
    if (count === 0) fail('STALE_APPLICATION')

    // Le candidat redevient simple apprenant ; ses achats et sa progression
    // ne sont pas touchés.
    await tx.user.update({ where: { id: application.userId }, data: { role: 'LEARNER' } })

    await tx.trainerApplicationReviewEvent.create({
      data: { applicationId, fromStatus: from, toStatus: 'REJECTED', actorId: adminId, reason },
    })
    await audit(tx, {
      actorId: adminId, actorRole: 'ADMIN',
      action: 'TRAINER_APPLICATION_REJECTED', targetType: 'TrainerApplication', targetId: applicationId,
      meta: { from, userId: application.userId, retentionDays: DOCUMENT_RETENTION_DAYS },
    })
  })

  const user = await db.user.findUnique({ where: { id: application.userId }, select: { email: true } })
  await notify(application.userId, {
    type: 'TRAINER_APPLICATION_REJECTED',
    title: "Votre candidature n'a pas été retenue",
    body: reason,
    link: '/candidature/statut',
  })
  await sendEmail({
    to: user!.email,
    subject: 'Suite donnée à votre candidature formateur — NkamVa',
    html: `<p>Votre candidature n'a pas été retenue.</p><p><b>Motif :</b> ${reason}</p><p>Vos pièces seront effacées ${DOCUMENT_RETENTION_DAYS} jours après cette décision.</p>`,
    text: `Votre candidature n'a pas été retenue.\n\nMotif : ${reason}\n\nVos pièces seront effacées ${DOCUMENT_RETENTION_DAYS} jours après cette décision.`,
    tags: ['trainer-application'],
  })
}

// --- T8 : réouverture (super-admin) ---

export async function reopenApplication(applicationId: string, adminId: string) {
  const application = await db.trainerApplication.findUnique({
    where: { id: applicationId },
    select: { id: true, userId: true, status: true, rejectedAt: true, reopenedById: true },
  })
  if (!application) fail('APPLICATION_NOT_FOUND')
  if (application.status !== 'REJECTED') fail('APPLICATION_NOT_REJECTED')
  // Une seule réouverture par dossier : au-delà, c'est une nouvelle candidature.
  if (application.reopenedById) fail('ALREADY_REOPENED')
  if (!application.rejectedAt) fail('APPLICATION_NOT_REJECTED')

  const elapsedHours = (Date.now() - application.rejectedAt.getTime()) / 3_600_000
  // Délai de réflexion : évite d'annuler une décision dans la foulée d'un
  // échange tendu.
  if (elapsedHours < REOPEN_MIN_DELAY_HOURS) fail('REOPEN_TOO_EARLY')

  const purged = await db.trainerDocument.count({
    where: { applicationId, purgedAt: { not: null } },
  })
  // Sans les pièces, il n'y a plus rien à réexaminer.
  if (purged > 0) fail('DOCUMENTS_PURGED')

  await db.$transaction(async (tx) => {
    const { count } = await tx.trainerApplication.updateMany({
      where: { id: applicationId, status: 'REJECTED', reopenedById: null },
      data: {
        status: 'RESUBMISSION_PENDING',
        reopenedById: adminId,
        reopenedAt: new Date(),
        rejectedAt: null,
        finalRejectionReason: null,
      },
    })
    if (count === 0) fail('ALREADY_REOPENED')

    await tx.user.update({ where: { id: application.userId }, data: { role: 'PENDING_TRAINER' } })

    await tx.trainerApplicationReviewEvent.create({
      data: {
        applicationId,
        fromStatus: 'REJECTED',
        toStatus: 'RESUBMISSION_PENDING',
        actorId: adminId,
        reason: 'Réouverture par un super-administrateur',
      },
    })
    await audit(tx, {
      actorId: adminId, actorRole: 'ADMIN',
      action: 'TRAINER_APPLICATION_REOPENED', targetType: 'TrainerApplication', targetId: applicationId,
      meta: { userId: application.userId },
    })
  })

  await notify(application.userId, {
    type: 'TRAINER_APPLICATION_REOPENED',
    title: 'Votre candidature est rouverte',
    body: 'Vous pouvez à nouveau compléter votre dossier.',
    link: '/candidature',
  })
}

// --- Consultation d'une pièce ---

/**
 * URL signée de courte durée vers une pièce. Aucun proxy : l'objet est servi
 * par le stockage, et la consultation est journalisée à l'émission du lien —
 * seul moment où l'application sait qu'un document est réellement regardé.
 */
export async function getDocumentViewUrl(documentId: string, adminId: string) {
  const document = await db.trainerDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true, s3Key: true, type: true, purgedAt: true, mimeType: true,
      application: { select: { id: true, userId: true } },
    },
  })
  if (!document) fail('DOCUMENT_NOT_FOUND')
  if (document.purgedAt) fail('DOCUMENT_PURGED')

  const url = await presignDownload(document.s3Key)

  await auditStandalone({
    actorId: adminId, actorRole: 'ADMIN',
    action: 'TRAINER_DOCUMENT_VIEW', targetType: 'TrainerDocument', targetId: documentId,
    meta: {
      applicationId: document.application.id,
      candidateId: document.application.userId,
      type: document.type,
    },
  })

  return { url, mimeType: document.mimeType }
}
