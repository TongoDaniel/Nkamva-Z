// ==========================================================================
// Lot 1 — Candidature formateur, côté candidat
// ==========================================================================
// Transitions couvertes ici : T1 (création), T2 (soumission), T5 (re-soumission)
// et, sur les pièces, D0 (demande d'envoi), D1 (confirmation), D4 (remplacement
// d'une pièce refusée). Les transitions de revue (T3, T4, T6, T7, T8, D2, D3,
// D5, D6) relèvent de l'espace admin et arriveront avec lui.
// ==========================================================================

import type { TrainerDocumentType, TrainerApplicationStatus } from '@prisma/client'
import { db } from './db'
import { audit, auditStandalone } from './audit'
import { notifyAdminSubRole } from './notification'
import {
  presignUpload,
  validateMagicNumber,
  computeObjectDigest,
  headObject,
  SIGNED_URL_TTL,
} from './s3'

export const MAX_RESUBMISSIONS = 3
export const DOCUMENT_RETENTION_DAYS = 90
export const REOPEN_MIN_DELAY_HOURS = 24

/** Les trois pièces attendues, dans l'ordre du parcours. */
export const REQUIRED_DOCUMENTS: TrainerDocumentType[] = ['ID_CARD', 'DIPLOMA', 'VIDEO']

export const DOCUMENT_LIMITS: Record<TrainerDocumentType, { mimes: string[]; maxSize: number }> = {
  ID_CARD: { mimes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], maxSize: 10_485_760 },
  DIPLOMA: { mimes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], maxSize: 10_485_760 },
  VIDEO: { mimes: ['video/mp4'], maxSize: 2_147_483_648 },
}

/** Statuts dans lesquels une pièce compte comme fournie et en attente de revue. */
const AWAITING_REVIEW = ['PENDING', 'RESUBMITTED'] as const

export class TrainerApplicationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TrainerApplicationError'
  }
}

function fail(code: string): never {
  throw new TrainerApplicationError(code)
}

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
}

// --- Lecture ---

const APPLICATION_SELECT = {
  id: true,
  status: true,
  slogan: true,
  description: true,
  websiteUrl: true,
  domains: true,
  experienceYears: true,
  submittedAt: true,
  reviewedAt: true,
  finalRejectionReason: true,
  approvedAt: true,
  rejectedAt: true,
  createdAt: true,
  updatedAt: true,
  documents: {
    where: { isCurrent: true },
    select: {
      id: true, type: true, status: true, rejectionReason: true,
      resubmissionCount: true, originalFileName: true, sizeBytes: true,
      purgedAt: true, createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  },
} as const

export async function getMyApplication(userId: string) {
  return db.trainerApplication.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: APPLICATION_SELECT,
  })
}

// --- T1 : création ---

export interface CreateApplicationInput {
  slogan?: string | null
  description?: string | null
  websiteUrl?: string | null
  domains?: string[]
  experienceYears?: number | null
}

export async function createApplication(userId: string, data: CreateApplicationInput) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, trainerProfile: { select: { id: true } } },
  })
  if (!user) fail('USER_NOT_FOUND')
  if (user.role === 'TRAINER' || user.trainerProfile) fail('ALREADY_TRAINER')

  // Une candidature refusée n'interdit pas de recommencer ; toute autre en
  // cours, si.
  const pending = await db.trainerApplication.findFirst({
    where: { userId, status: { not: 'REJECTED' } },
    select: { id: true },
  })
  if (pending) fail('APPLICATION_ALREADY_EXISTS')

  const application = await db.trainerApplication.create({
    data: {
      userId,
      status: 'DRAFT',
      slogan: data.slogan?.trim() || null,
      description: data.description?.trim() || null,
      websiteUrl: data.websiteUrl?.trim() || null,
      domains: data.domains ?? [],
      experienceYears: data.experienceYears ?? null,
    },
    select: APPLICATION_SELECT,
  })

  await auditStandalone({
    actorId: userId, actorRole: 'LEARNER',
    action: 'TRAINER_APPLICATION_CREATED', targetType: 'TrainerApplication', targetId: application.id,
  })

  return application
}

/** Mise à jour de la présentation, tant que le dossier n'est pas soumis. */
export async function updateApplication(userId: string, data: CreateApplicationInput) {
  const application = await db.trainerApplication.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true },
  })
  if (!application) fail('APPLICATION_NOT_FOUND')
  if (!['DRAFT', 'RESUBMISSION_PENDING'].includes(application.status)) fail('APPLICATION_NOT_EDITABLE')

  return db.trainerApplication.update({
    where: { id: application.id },
    data: {
      ...(data.slogan !== undefined && { slogan: data.slogan?.trim() || null }),
      ...(data.description !== undefined && { description: data.description?.trim() || null }),
      ...(data.websiteUrl !== undefined && { websiteUrl: data.websiteUrl?.trim() || null }),
      ...(data.domains !== undefined && { domains: data.domains }),
      ...(data.experienceYears !== undefined && { experienceYears: data.experienceYears }),
    },
    select: APPLICATION_SELECT,
  })
}

// --- D0 : demande d'envoi d'une pièce ---

export interface UploadTicket {
  documentId: string
  uploadUrl: string
  s3Key: string
  expiresAt: Date
}

export async function requestDocumentUpload(
  userId: string,
  params: { type: TrainerDocumentType; mimeType: string; sizeBytes: number; originalFileName?: string },
): Promise<UploadTicket> {
  // La disponibilité du stockage se vérifie à la frontière HTTP, pas ici :
  // ce service ne porte que la machine à états, qui doit rester exerçable
  // sans dépendre d'un bucket.
  const application = await db.trainerApplication.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true },
  })
  if (!application) fail('APPLICATION_NOT_FOUND')
  if (!['DRAFT', 'RESUBMISSION_PENDING'].includes(application.status)) fail('APPLICATION_NOT_EDITABLE')

  const limits = DOCUMENT_LIMITS[params.type]
  if (!limits.mimes.includes(params.mimeType)) fail('MIME_NOT_ALLOWED')
  if (params.sizeBytes <= 0) fail('EMPTY_FILE')
  if (params.sizeBytes > limits.maxSize) fail('SIZE_EXCEEDS_LIMIT')

  const previous = await db.trainerDocument.findFirst({
    where: { applicationId: application.id, type: params.type, isCurrent: true },
    select: { id: true, status: true, resubmissionCount: true },
  })

  // D4 : remplacer une pièce refusée ne se fait qu'en re-soumission, et pas
  // au-delà de MAX_RESUBMISSIONS.
  let resubmissionCount = 0
  if (previous) {
    if (application.status === 'RESUBMISSION_PENDING') {
      if (previous.status !== 'REJECTED') fail('DOCUMENT_NOT_REJECTED')
      if (previous.resubmissionCount + 1 > MAX_RESUBMISSIONS) fail('MAX_RESUBMISSIONS_REACHED')
      resubmissionCount = previous.resubmissionCount + 1
    } else if (previous.status !== 'AWAITING_UPLOAD') {
      // En brouillon, on autorise à refaire l'envoi tant que la pièce n'a pas
      // été soumise à la revue.
      if (!['PENDING'].includes(previous.status)) fail('DOCUMENT_NOT_REPLACEABLE')
    }
  }

  const extension = EXTENSIONS[params.mimeType] ?? 'bin'
  const s3Key = `trainer-documents/${application.id}/${params.type}-v${resubmissionCount}-${crypto.randomUUID()}.${extension}`
  const { uploadUrl, expiresAt } = await presignUpload(s3Key, params.mimeType, params.sizeBytes)

  // Bascule atomique : l'ancienne ligne cesse d'être courante au moment même
  // où la nouvelle apparaît, sans quoi deux pièces courantes coexisteraient.
  const document = await db.$transaction(async (tx) => {
    if (previous) {
      await tx.trainerDocument.update({ where: { id: previous.id }, data: { isCurrent: false } })
    }
    const created = await tx.trainerDocument.create({
      data: {
        applicationId: application.id,
        type: params.type,
        status: 'AWAITING_UPLOAD',
        isCurrent: true,
        s3Key,
        sha256: '',
        sizeBytes: params.sizeBytes,
        mimeType: params.mimeType,
        originalFileName: params.originalFileName?.slice(0, 200) ?? null,
        resubmissionCount,
      },
      select: { id: true },
    })
    await audit(tx, {
      actorId: userId, actorRole: 'LEARNER',
      action: 'TRAINER_DOCUMENT_UPLOAD_REQUESTED', targetType: 'TrainerDocument', targetId: created.id,
      meta: { type: params.type, resubmissionCount, sizeBytes: params.sizeBytes },
    })
    return created
  })

  return { documentId: document.id, uploadUrl, s3Key, expiresAt }
}

// --- D1 : confirmation de l'envoi ---

export async function confirmDocumentUpload(userId: string, documentId: string) {
  const document = await db.trainerDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true, status: true, s3Key: true, mimeType: true, sizeBytes: true,
      type: true, resubmissionCount: true, isCurrent: true,
      application: { select: { id: true, userId: true, status: true } },
    },
  })
  if (!document) fail('DOCUMENT_NOT_FOUND')
  if (document.application.userId !== userId) fail('NOT_OWNER')
  if (document.status !== 'AWAITING_UPLOAD') fail('DOCUMENT_NOT_AWAITING_UPLOAD')
  if (!document.isCurrent) fail('DOCUMENT_SUPERSEDED')

  // Le fichier annoncé existe-t-il, fait-il la taille déclarée, et son entête
  // correspond-elle au type MIME prétendu ?
  const head = await headObject(document.s3Key)
  if (!head) fail('UPLOAD_NOT_FOUND')
  if (head.contentLength === 0) fail('EMPTY_FILE')
  const limits = DOCUMENT_LIMITS[document.type]
  if (head.contentLength > limits.maxSize) fail('SIZE_EXCEEDS_LIMIT')

  try {
    await validateMagicNumber(document.s3Key, document.mimeType!)
  } catch (err) {
    fail(err instanceof Error ? err.message : 'MAGIC_NUMBER_MISMATCH')
  }

  const digest = await computeObjectDigest(document.s3Key, head.contentLength)

  // Une pièce re-soumise se distingue d'une première remise : l'admin doit
  // voir qu'elle a déjà fait un aller-retour.
  const nextStatus = document.resubmissionCount > 0 ? 'RESUBMITTED' : 'PENDING'

  return db.$transaction(async (tx) => {
    const { count } = await tx.trainerDocument.updateMany({
      where: { id: documentId, status: 'AWAITING_UPLOAD' },
      data: { status: nextStatus, sha256: digest, sizeBytes: head.contentLength },
    })
    if (count === 0) fail('DOCUMENT_NOT_AWAITING_UPLOAD')

    await tx.trainerDocumentReviewEvent.create({
      data: { documentId, fromStatus: 'AWAITING_UPLOAD', toStatus: nextStatus, actorId: userId },
    })
    await audit(tx, {
      actorId: userId, actorRole: 'LEARNER',
      action: 'TRAINER_DOCUMENT_CONFIRMED', targetType: 'TrainerDocument', targetId: documentId,
      meta: { type: document.type, status: nextStatus, sizeBytes: head.contentLength },
    })

    return tx.trainerDocument.findUnique({
      where: { id: documentId },
      select: { id: true, type: true, status: true, resubmissionCount: true, sizeBytes: true },
    })
  })
}

// --- T2 / T5 : soumission ---

/** Pièces courantes manquantes ou pas encore confirmées. */
export async function missingDocuments(applicationId: string): Promise<TrainerDocumentType[]> {
  const documents = await db.trainerDocument.findMany({
    where: { applicationId, isCurrent: true, status: { in: [...AWAITING_REVIEW] } },
    select: { type: true },
  })
  const provided = new Set(documents.map((d) => d.type))
  return REQUIRED_DOCUMENTS.filter((type) => !provided.has(type))
}

export async function submitApplication(userId: string) {
  const application = await db.trainerApplication.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true },
  })
  if (!application) fail('APPLICATION_NOT_FOUND')
  if (!['DRAFT', 'RESUBMISSION_PENDING'].includes(application.status)) fail('APPLICATION_NOT_SUBMITTABLE')

  const missing = await missingDocuments(application.id)
  if (missing.length > 0) fail('DOCUMENTS_INCOMPLETE')

  const from = application.status as TrainerApplicationStatus

  const updated = await db.$transaction(async (tx) => {
    // Garde sur le statut de départ : deux soumissions concurrentes n'en
    // produisent qu'une seule.
    const { count } = await tx.trainerApplication.updateMany({
      where: { id: application.id, status: from },
      data: { status: 'SUBMITTED', submittedAt: new Date(), reviewedAt: null, reviewedById: null },
    })
    if (count === 0) fail('APPLICATION_NOT_SUBMITTABLE')

    await tx.trainerApplicationReviewEvent.create({
      data: { applicationId: application.id, fromStatus: from, toStatus: 'SUBMITTED', actorId: userId },
    })

    // T2 seulement : la première soumission fait basculer le rôle. Une
    // re-soumission part déjà de PENDING_TRAINER.
    //
    // La spécification prévoyait de bumper `sessionsValidAfter` ici, pour que
    // le jeton reflète le nouveau rôle. Ce n'est plus nécessaire : le callback
    // de session relit le rôle en base à chaque requête. Le bumper
    // déconnecterait le candidat au moment même où il envoie son dossier —
    // une punition pour une bonne action. L'invalidation reste réservée à ce
    // pour quoi elle existe : révoquer un accès (mot de passe, suspension,
    // suppression de compte).
    if (from === 'DRAFT') {
      await tx.user.update({ where: { id: userId }, data: { role: 'PENDING_TRAINER' } })
    }

    await audit(tx, {
      actorId: userId, actorRole: 'LEARNER',
      action: from === 'DRAFT' ? 'TRAINER_APPLICATION_SUBMITTED' : 'TRAINER_APPLICATION_RESUBMITTED',
      targetType: 'TrainerApplication', targetId: application.id,
      meta: { from },
    })

    return tx.trainerApplication.findUnique({ where: { id: application.id }, select: APPLICATION_SELECT })
  })

  await notifyAdminSubRole('MODERATION', {
    type: 'TRAINER_APPLICATION_SUBMITTED',
    title: 'Nouvelle candidature formateur',
    body: 'Un dossier attend votre revue.',
    link: `/admin/validation-formateurs/${application.id}`,
  })

  return updated
}

/** Durée de validité d'une URL d'envoi, exposée au front pour l'affichage. */
export const UPLOAD_URL_TTL_SECONDS = SIGNED_URL_TTL
