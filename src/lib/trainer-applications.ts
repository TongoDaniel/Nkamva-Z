// ==========================================================================
// Lot 1 — Validation des formateurs
// ==========================================================================
// Machine à états TrainerApplication T1-T8.
//
// Invariants tenus par ce module :
//   - le rôle User suit le dossier : LEARNER → PENDING_TRAINER → TRAINER,
//     et redescend à LEARNER sur rejet définitif
//   - tout changement de rôle bump `sessionsValidAfter` (révocation des sessions)
//   - l'approbation crée TrainerProfile + Wallet dans la MÊME transaction
//   - une seule pièce `isCurrent` par type et par dossier
//   - décision 3 : aucun RIB ici, il n'est collecté qu'avant le premier retrait
// ==========================================================================

import type { Prisma, TrainerApplicationStatus, TrainerDocumentType, TrainerDocumentStatus } from '@prisma/client'
import { db } from './db'
import { audit, auditStandalone } from './audit'
import { notify, notifyAdminSubRole, deliverSideEffects, absoluteUrl } from './notification'
import { sendEmail, renderSimpleEmail } from './email'
import {
  REQUIRED_DOCUMENT_TYPES, CONFIRMED_DOCUMENT_STATUSES,
  approveCurrentDocuments, rejectDocumentsInTx,
} from './trainer-documents'
import { openFirstPeriod } from './subscriptions'
import type { PrismaTransaction } from './types'

export const REOPEN_MIN_DELAY_HOURS = 24

export const TERMINAL_APPLICATION_STATUSES: TrainerApplicationStatus[] = ['APPROVED', 'REJECTED']

// ==========================================================================
// Helpers
// ==========================================================================

// Tout changement de rôle invalide les sessions en cours : le JWT porte le rôle,
// il ne doit pas survivre à une bascule (cf. callback session de lib/auth.ts).
async function setUserRole(
  tx: PrismaTransaction,
  userId: string,
  role: 'LEARNER' | 'PENDING_TRAINER' | 'TRAINER',
  reason: string,
) {
  await tx.user.update({
    where: { id: userId },
    data: { role, sessionsValidAfter: new Date() },
  })
  await audit(tx, {
    actorId: userId, actorRole: role,
    action: 'USER_ROLE_CHANGED', targetType: 'User', targetId: userId,
    meta: { role, reason },
  })
}

async function recordTransition(
  tx: PrismaTransaction,
  params: {
    applicationId: string
    fromStatus: TrainerApplicationStatus
    toStatus: TrainerApplicationStatus
    actorId: string | null
    reason?: string | null
    rejectedDocIds?: string[]
  },
) {
  await tx.trainerApplicationReviewEvent.create({
    data: {
      applicationId: params.applicationId,
      fromStatus: params.fromStatus,
      toStatus: params.toStatus,
      actorId: params.actorId,
      reason: params.reason ?? null,
      rejectedDocIds: params.rejectedDocIds ?? [],
    },
  })
}

// Contrôle optimiste : la mise à jour ne passe que si `updatedAt` n'a pas bougé.
async function guardedUpdate(
  tx: PrismaTransaction,
  applicationId: string,
  fromStatus: TrainerApplicationStatus,
  expectedUpdatedAt: string | null,
  data: Prisma.TrainerApplicationUpdateManyMutationInput,
) {
  const guard = await tx.trainerApplication.updateMany({
    where: {
      id: applicationId,
      status: fromStatus,
      ...(expectedUpdatedAt ? { updatedAt: new Date(expectedUpdatedAt) } : {}),
    },
    data,
  })
  if (guard.count === 0) throw new Error('STALE_APPLICATION')
}

// ==========================================================================
// T1 — ∅ → DRAFT
// ==========================================================================

export interface CreateApplicationInput {
  slogan?: string | null
  description?: string | null
  websiteUrl?: string | null
  domains?: string[]
  experienceYears?: number | null
}

export async function createApplication(userId: string, input: CreateApplicationInput) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, deletedAt: true },
  })
  if (!user || user.deletedAt) throw new Error('USER_NOT_FOUND')
  if (user.role === 'TRAINER') throw new Error('ALREADY_TRAINER')

  // Un dossier rejeté n'empêche pas d'en ouvrir un nouveau ; tout autre statut si.
  const existing = await db.trainerApplication.findFirst({
    where: { userId, status: { not: 'REJECTED' } },
    select: { id: true },
  })
  if (existing) throw new Error('APPLICATION_ALREADY_EXISTS')

  const application = await db.trainerApplication.create({
    data: {
      userId,
      status: 'DRAFT',
      slogan: input.slogan ?? null,
      description: input.description ?? null,
      websiteUrl: input.websiteUrl ?? null,
      domains: input.domains ?? [],
      experienceYears: input.experienceYears ?? null,
    },
  })

  // T1 — le rôle reste LEARNER tant que le dossier n'est pas soumis.
  await auditStandalone({
    actorId: userId, actorRole: user.role,
    action: 'TRAINER_APPLICATION_CREATED', targetType: 'TrainerApplication', targetId: application.id,
  })

  return application
}

export async function getMyApplication(userId: string) {
  return db.trainerApplication.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      documents: {
        where: { isCurrent: true },
        select: {
          id: true, type: true, status: true, rejectionReason: true, resubmissionCount: true,
          originalFileName: true, sizeBytes: true, mimeType: true, purgedAt: true,
          createdAt: true, updatedAt: true,
        },
        orderBy: { type: 'asc' },
      },
      reviewEvents: { orderBy: { createdAt: 'asc' } },
    },
  })
}

// ==========================================================================
// T2 / T5 — DRAFT | RESUBMISSION_PENDING → SUBMITTED
// ==========================================================================

export async function submitApplication(userId: string) {
  const application = await db.trainerApplication.findFirst({
    where: { userId, status: { not: 'REJECTED' } },
    orderBy: { createdAt: 'desc' },
    include: { documents: { where: { isCurrent: true } } },
  })
  if (!application) throw new Error('APPLICATION_NOT_FOUND')
  if (!['DRAFT', 'RESUBMISSION_PENDING'].includes(application.status)) throw new Error('APPLICATION_NOT_SUBMITTABLE')

  // Les 3 pièces obligatoires doivent être confirmées (PENDING ou RESUBMITTED).
  // Une pièce encore REJECTED bloque la re-soumission (T5).
  for (const type of REQUIRED_DOCUMENT_TYPES) {
    const doc = application.documents.find(d => d.type === type)
    if (!doc) throw new Error('DOCUMENTS_INCOMPLETE')
    if (doc.status === 'APPROVED') continue
    if (!CONFIRMED_DOCUMENT_STATUSES.includes(doc.status)) throw new Error('DOCUMENTS_INCOMPLETE')
  }

  const fromStatus = application.status

  const updated = await db.$transaction(async (tx) => {
    await guardedUpdate(tx, application.id, fromStatus, null, {
      status: 'SUBMITTED',
      submittedAt: new Date(),
      // Nouvelle instruction : la décision précédente ne vaut plus.
      reviewedAt: null,
      reviewedById: null,
    })
    await setUserRole(tx, userId, 'PENDING_TRAINER', 'TRAINER_APPLICATION_SUBMITTED')
    await recordTransition(tx, {
      applicationId: application.id, fromStatus, toStatus: 'SUBMITTED', actorId: userId,
    })
    await audit(tx, {
      actorId: userId, actorRole: 'PENDING_TRAINER',
      action: 'TRAINER_APPLICATION_SUBMITTED', targetType: 'TrainerApplication', targetId: application.id,
      meta: { fromStatus, resubmission: fromStatus === 'RESUBMISSION_PENDING' },
    })
    return tx.trainerApplication.findUniqueOrThrow({ where: { id: application.id } })
  })

  await deliverSideEffects('TRAINER_APPLICATION_SUBMITTED', { type: 'TrainerApplication', id: application.id }, () =>
    notifyAdminSubRole('MODERATION', {
      type: 'TRAINER_APPLICATION_SUBMITTED',
      title: fromStatus === 'RESUBMISSION_PENDING' ? 'Candidature re-soumise' : 'Nouvelle candidature formateur',
      body: 'Un dossier est en attente d\'instruction.',
      link: `/admin/validation-formateurs/${application.id}`,
    }),
  )

  return updated
}

// ==========================================================================
// T3 — SUBMITTED → APPROVED
// ==========================================================================

export interface ApproveInput {
  verifiedLegalName: string
  expectedUpdatedAt: string
  actorId: string
}

export async function approveApplication(applicationId: string, input: ApproveInput) {
  const application = await db.trainerApplication.findUnique({
    where: { id: applicationId },
    include: { user: { select: { id: true, email: true, fullName: true } } },
  })
  if (!application) throw new Error('APPLICATION_NOT_FOUND')
  if (application.status !== 'SUBMITTED') throw new Error('APPLICATION_NOT_SUBMITTED')

  const result = await db.$transaction(async (tx) => {
    await guardedUpdate(tx, applicationId, 'SUBMITTED', input.expectedUpdatedAt, {
      status: 'APPROVED',
      approvedAt: new Date(),
      reviewedById: input.actorId,
      reviewedAt: new Date(),
    })

    // D2/D5 — l'approbation du dossier vaut approbation des pièces courantes.
    await approveCurrentDocuments(tx, applicationId, input.actorId)

    // Le profil et le portefeuille naissent dans la MÊME transaction que la
    // bascule de rôle : un formateur TRAINER sans wallet serait incohérent.
    const profile = await tx.trainerProfile.create({
      data: {
        userId: application.userId,
        verifiedLegalName: input.verifiedLegalName,
        slogan: application.slogan,
        description: application.description,
        websiteUrl: application.websiteUrl,
        domains: application.domains,
        experienceYears: application.experienceYears,
        approvedAt: new Date(),
      },
    })
    await tx.wallet.create({ data: { trainerId: profile.id } })

    // La première période d'abonnement naît ici aussi : un formateur sans
    // période serait invisible du renouvellement, donc jamais facturé.
    // Au tarif de lancement (0), elle est ouverte comme offerte, pas comme due.
    await openFirstPeriod(tx, profile.id)

    await setUserRole(tx, application.userId, 'TRAINER', 'TRAINER_APPLICATION_APPROVED')
    await recordTransition(tx, {
      applicationId, fromStatus: 'SUBMITTED', toStatus: 'APPROVED', actorId: input.actorId,
    })
    await audit(tx, {
      actorId: input.actorId, actorRole: 'MODERATION',
      action: 'TRAINER_APPLICATION_APPROVED', targetType: 'TrainerApplication', targetId: applicationId,
      meta: { userId: application.userId, trainerProfileId: profile.id, verifiedLegalName: input.verifiedLegalName },
    })

    return { profile, application: await tx.trainerApplication.findUniqueOrThrow({ where: { id: applicationId } }) }
  })

  await deliverSideEffects('TRAINER_APPLICATION_APPROVED', { type: 'TrainerApplication', id: applicationId }, async () => {
    await notify(application.userId, {
      type: 'TRAINER_APPLICATION_APPROVED',
      title: 'Votre candidature est acceptée',
      body: 'Vous pouvez désormais publier des ressources sur NkamVa.',
      link: '/formateur',
    })
    await sendEmail({
      to: application.user.email,
      subject: 'NkamVa — Votre candidature formateur est acceptée',
      ...renderSimpleEmail({
        title: 'Votre candidature est acceptée',
        paragraphs: [
          'Bonne nouvelle : votre candidature de formateur a été acceptée.',
          'Votre espace formateur est ouvert, vous pouvez publier vos premières ressources.',
        ],
        cta: { label: 'Accéder à mon espace', url: absoluteUrl('/formateur') },
      }),
      tags: ['trainer-application-approved'],
    })
  })

  return result.application
}

// ==========================================================================
// T4 — SUBMITTED → RESUBMISSION_PENDING (rejet partiel)
// ==========================================================================

export interface RejectDocumentsInput {
  rejections: { documentId: string; rejectionReason: string }[]
  expectedUpdatedAt: string
  actorId: string
}

export async function rejectDocuments(applicationId: string, input: RejectDocumentsInput) {
  if (input.rejections.length === 0) throw new Error('NO_DOCUMENT_REJECTED')

  const application = await db.trainerApplication.findUnique({
    where: { id: applicationId },
    include: { user: { select: { id: true, email: true } } },
  })
  if (!application) throw new Error('APPLICATION_NOT_FOUND')
  if (application.status !== 'SUBMITTED') throw new Error('APPLICATION_NOT_SUBMITTED')

  const rejectedIds = await db.$transaction(async (tx) => {
    await guardedUpdate(tx, applicationId, 'SUBMITTED', input.expectedUpdatedAt, {
      status: 'RESUBMISSION_PENDING',
      reviewedById: input.actorId,
      reviewedAt: new Date(),
    })

    const ids = await rejectDocumentsInTx(tx, applicationId, input.actorId, input.rejections)

    await recordTransition(tx, {
      applicationId, fromStatus: 'SUBMITTED', toStatus: 'RESUBMISSION_PENDING',
      actorId: input.actorId, rejectedDocIds: ids,
    })
    await audit(tx, {
      actorId: input.actorId, actorRole: 'MODERATION',
      action: 'TRAINER_APPLICATION_DOCUMENTS_REJECTED', targetType: 'TrainerApplication', targetId: applicationId,
      meta: { rejectedDocumentIds: ids, count: ids.length },
    })
    return ids
  })

  // Les motifs sont saisis par un admin : ils passent par le gabarit, qui les
  // échappe, plutôt que d'être concaténés dans du balisage.
  const reasons = input.rejections.map(r => `— ${r.rejectionReason}`).join('\n')
  await deliverSideEffects('TRAINER_DOCUMENTS_REJECTED', { type: 'TrainerApplication', id: applicationId }, async () => {
    await notify(application.userId, {
      type: 'TRAINER_DOCUMENTS_REJECTED',
      title: 'Des pièces doivent être renvoyées',
      body: `${rejectedIds.length} pièce(s) ont été refusées. Vous pouvez les renvoyer depuis votre dossier.`,
      link: '/candidature/statut',
    })
    await sendEmail({
      to: application.user.email,
      subject: 'NkamVa — Des pièces de votre candidature doivent être renvoyées',
      ...renderSimpleEmail({
        title: 'Des pièces sont à renvoyer',
        paragraphs: [
          'Notre équipe a examiné votre candidature : certaines pièces doivent être renvoyées.',
          reasons,
          'Les pièces déjà validées sont conservées.',
        ],
        cta: { label: 'Renvoyer mes pièces', url: absoluteUrl('/candidature/statut') },
      }),
      tags: ['trainer-documents-rejected'],
    })
  })

  return db.trainerApplication.findUniqueOrThrow({ where: { id: applicationId } })
}

// ==========================================================================
// T6 / T7 — SUBMITTED | RESUBMISSION_PENDING → REJECTED (rejet définitif)
// ==========================================================================

export interface RejectFinalInput {
  reason: string
  expectedUpdatedAt: string
  actorId: string
}

export async function rejectApplicationFinal(applicationId: string, input: RejectFinalInput) {
  const application = await db.trainerApplication.findUnique({
    where: { id: applicationId },
    include: { user: { select: { id: true, email: true } } },
  })
  if (!application) throw new Error('APPLICATION_NOT_FOUND')
  if (!['SUBMITTED', 'RESUBMISSION_PENDING'].includes(application.status)) throw new Error('APPLICATION_NOT_REJECTABLE')

  const fromStatus = application.status

  await db.$transaction(async (tx) => {
    await guardedUpdate(tx, applicationId, fromStatus, input.expectedUpdatedAt, {
      status: 'REJECTED',
      rejectedAt: new Date(),
      finalRejectionReason: input.reason,
      reviewedById: input.actorId,
      reviewedAt: new Date(),
    })

    // T6/T7 — le candidat redevient un simple apprenant.
    await setUserRole(tx, application.userId, 'LEARNER', 'TRAINER_APPLICATION_REJECTED')

    await recordTransition(tx, {
      applicationId, fromStatus, toStatus: 'REJECTED', actorId: input.actorId, reason: input.reason,
    })
    await audit(tx, {
      actorId: input.actorId, actorRole: 'MODERATION',
      action: 'TRAINER_APPLICATION_REJECTED', targetType: 'TrainerApplication', targetId: applicationId,
      meta: { fromStatus, reason: input.reason, userId: application.userId },
    })
  })

  await deliverSideEffects('TRAINER_APPLICATION_REJECTED', { type: 'TrainerApplication', id: applicationId }, async () => {
    await notify(application.userId, {
      type: 'TRAINER_APPLICATION_REJECTED',
      title: 'Votre candidature n\'a pas été retenue',
      body: input.reason,
      link: '/candidature/statut',
    })
    await sendEmail({
      to: application.user.email,
      subject: 'NkamVa — Votre candidature formateur n\'a pas été retenue',
      ...renderSimpleEmail({
        title: 'Suite donnée à votre candidature',
        paragraphs: ['Après examen, votre candidature n\'a pas été retenue.', `Motif : ${input.reason}`],
        cta: { label: 'Consulter mon dossier', url: absoluteUrl('/candidature/statut') },
      }),
      tags: ['trainer-application-rejected'],
    })
  })

  return db.trainerApplication.findUniqueOrThrow({ where: { id: applicationId } })
}

// ==========================================================================
// T8 — REJECTED → RESUBMISSION_PENDING (réouverture Super-admin)
// ==========================================================================

export async function reopenApplication(applicationId: string, actorId: string) {
  const application = await db.trainerApplication.findUnique({
    where: { id: applicationId },
    include: { documents: { select: { purgedAt: true } } },
  })
  if (!application) throw new Error('APPLICATION_NOT_FOUND')

  // Les 4 conditions cumulatives de T8.
  if (application.status !== 'REJECTED') throw new Error('APPLICATION_NOT_REJECTED')
  if (application.reopenedById) throw new Error('ALREADY_REOPENED')
  if (!application.rejectedAt || application.rejectedAt > new Date(Date.now() - REOPEN_MIN_DELAY_HOURS * 3_600_000)) {
    throw new Error('REOPEN_TOO_EARLY')
  }
  // Une pièce purgée est irrécupérable : le dossier ne peut plus être instruit.
  if (application.documents.some(d => d.purgedAt)) throw new Error('REOPEN_IMPOSSIBLE')

  await db.$transaction(async (tx) => {
    await guardedUpdate(tx, applicationId, 'REJECTED', null, {
      status: 'RESUBMISSION_PENDING',
      reopenedById: actorId,
      reopenedAt: new Date(),
      rejectedAt: null,
      finalRejectionReason: null,
    })
    await setUserRole(tx, application.userId, 'PENDING_TRAINER', 'TRAINER_APPLICATION_REOPENED')
    await recordTransition(tx, {
      applicationId, fromStatus: 'REJECTED', toStatus: 'RESUBMISSION_PENDING', actorId,
    })
    await audit(tx, {
      actorId, actorRole: 'SUPER_ADMIN',
      action: 'TRAINER_APPLICATION_REOPENED', targetType: 'TrainerApplication', targetId: applicationId,
      meta: { userId: application.userId },
    })
  })

  await deliverSideEffects('TRAINER_APPLICATION_REOPENED', { type: 'TrainerApplication', id: applicationId }, () =>
    notify(application.userId, {
      type: 'TRAINER_APPLICATION_REOPENED',
      title: 'Votre candidature a été rouverte',
      body: 'Vous pouvez renvoyer les pièces demandées.',
      link: '/candidature/statut',
    }),
  )

  return db.trainerApplication.findUniqueOrThrow({ where: { id: applicationId } })
}

// ==========================================================================
// Lectures admin
// ==========================================================================

export interface ListApplicationsFilters {
  status?: TrainerApplicationStatus
  page?: number
  pageSize?: number
}

export async function listApplications(filters: ListApplicationsFilters) {
  const page = filters.page ?? 1
  const pageSize = Math.min(filters.pageSize ?? 20, 50)
  const where: Prisma.TrainerApplicationWhereInput = filters.status ? { status: filters.status } : {}

  const [items, total] = await Promise.all([
    db.trainerApplication.findMany({
      where,
      include: {
        user: { select: { id: true, email: true, fullName: true, role: true } },
        documents: {
          where: { isCurrent: true },
          select: { id: true, type: true, status: true, resubmissionCount: true },
        },
      },
      // Les plus anciennes soumissions d'abord : la file se traite dans l'ordre.
      orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.trainerApplication.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function getApplicationDetail(applicationId: string) {
  const application = await db.trainerApplication.findUnique({
    where: { id: applicationId },
    include: {
      user: { select: { id: true, email: true, fullName: true, role: true, createdAt: true } },
      documents: { orderBy: [{ type: 'asc' }, { resubmissionCount: 'asc' }] },
      reviewEvents: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!application) throw new Error('APPLICATION_NOT_FOUND')
  return application
}

export async function getApplicationStats() {
  const [byStatus, decided] = await Promise.all([
    db.trainerApplication.groupBy({ by: ['status'], _count: { _all: true } }),
    db.trainerApplication.findMany({
      where: { submittedAt: { not: null }, reviewedAt: { not: null } },
      select: { submittedAt: true, reviewedAt: true },
      take: 500,
      orderBy: { reviewedAt: 'desc' },
    }),
  ])

  const durations = decided.map(a => (a.reviewedAt!.getTime() - a.submittedAt!.getTime()) / 3_600_000)
  const avgReviewHours = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null

  const counts = Object.fromEntries(byStatus.map(r => [r.status, r._count._all]))
  return {
    byStatus: counts,
    pending: (counts.SUBMITTED ?? 0) + (counts.RESUBMISSION_PENDING ?? 0),
    avgReviewHours,
  }
}

// ==========================================================================
// Compatibilité front (écrans issus de la branche design tokens)
// ==========================================================================
// Mêmes valeurs que les constantes de référence : on les ré-expose ici sans
// les redéfinir, pour que les deux modules ne puissent pas diverger.

export { MAX_RESUBMISSIONS, DOCUMENT_RETENTION_DAYS } from './trainer-documents'

/** Erreur métier des services de revue. Mappée en HTTP par les routes. */
export class TrainerApplicationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TrainerApplicationError'
  }
}

/** Alias de `REQUIRED_DOCUMENT_TYPES`, sous le nom attendu par les écrans. */
export const REQUIRED_DOCUMENTS = REQUIRED_DOCUMENT_TYPES

/**
 * Statuts qui valent « pièce fournie » pour la complétude du dossier.
 *
 * Volontairement plus large que `CONFIRMED_DOCUMENT_STATUSES`, qui sert à
 * décider d'une re-soumission : une pièce déjà validée reste fournie et ne
 * doit pas être redemandée au candidat lors d'un renvoi partiel du dossier.
 */
const SUPPLIED_DOCUMENT_STATUSES: TrainerDocumentStatus[] = ['PENDING', 'RESUBMITTED', 'APPROVED']

/** Types de pièces encore attendues pour que la candidature soit soumettable. */
export async function missingDocuments(applicationId: string): Promise<TrainerDocumentType[]> {
  const documents = await db.trainerDocument.findMany({
    where: { applicationId, isCurrent: true, status: { in: SUPPLIED_DOCUMENT_STATUSES } },
    select: { type: true },
  })
  const provided = new Set(documents.map(d => d.type))
  return REQUIRED_DOCUMENT_TYPES.filter(type => !provided.has(type))
}
