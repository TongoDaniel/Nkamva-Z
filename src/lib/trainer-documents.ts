// ==========================================================================
// Lot 1 — Pièces justificatives des candidatures formateur
// ==========================================================================
// Machine à états TrainerDocument D0-D7.
//
// Règles de sécurité (§3.2 de la spec Lot 1) :
//   - upload direct R2 pré-signé, jamais de proxy backend
//   - URL de consultation signée, TTL 5 min, journalisée à la redirection
//   - Modération uniquement : Finances n'accède JAMAIS aux pièces d'identité
//   - conservation 90 jours après décision, puis purge R2 + nullification
// ==========================================================================

import type { TrainerDocumentType, TrainerDocumentStatus } from '@prisma/client'
import { db } from './db'
import { audit, auditStandalone } from './audit'
import {
  presignUpload, presignDownload, deleteObject, validateMagicNumber, isS3Configured,
} from './s3'
import type { PrismaTransaction } from './types'

export const MAX_RESUBMISSIONS = 3
export const SIGNED_URL_TTL_SECONDS = 300
export { DOCUMENT_RETENTION_DAYS } from './rules'
import { DOCUMENT_RETENTION_DAYS } from './rules'

export const REQUIRED_DOCUMENT_TYPES: TrainerDocumentType[] = ['ID_CARD', 'DIPLOMA', 'VIDEO']

// Un document est « confirmé » (téléversé et vérifié) dans ces deux états.
export const CONFIRMED_DOCUMENT_STATUSES: TrainerDocumentStatus[] = ['PENDING', 'RESUBMITTED']

export const DOCUMENT_LIMITS: Record<TrainerDocumentType, { mimes: string[]; maxSize: number }> = {
  ID_CARD: { mimes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], maxSize: 10_485_760 },
  DIPLOMA: { mimes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], maxSize: 10_485_760 },
  VIDEO: { mimes: ['video/mp4'], maxSize: 2_147_483_648 },
}

const MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
}

// ==========================================================================
// D0 — ∅ → AWAITING_UPLOAD (presign)
// ==========================================================================

export interface RequestUploadInput {
  type: TrainerDocumentType
  mimeType: string
  sizeBytes: number
  sha256: string
  originalFileName?: string | null
}

export async function requestDocumentUpload(userId: string, input: RequestUploadInput) {
  const application = await db.trainerApplication.findFirst({
    where: { userId, status: { not: 'REJECTED' } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, userId: true, status: true },
  })
  if (!application) throw new Error('APPLICATION_NOT_FOUND')
  if (!['DRAFT', 'RESUBMISSION_PENDING'].includes(application.status)) throw new Error('APPLICATION_NOT_EDITABLE')

  const limits = DOCUMENT_LIMITS[input.type]
  if (!limits.mimes.includes(input.mimeType)) throw new Error('MIME_NOT_ALLOWED')
  if (input.sizeBytes <= 0 || input.sizeBytes > limits.maxSize) throw new Error('SIZE_EXCEEDS_LIMIT')

  const current = await db.trainerDocument.findFirst({
    where: { applicationId: application.id, type: input.type, isCurrent: true },
    select: { id: true, status: true, resubmissionCount: true },
  })

  // Une pièce encore AWAITING_UPLOAD n'a jamais été confirmée : l'upload a
  // échoué ou été abandonné. C'est une simple reprise, pas une re-soumission —
  // elle ne consomme pas de compteur et reste possible quel que soit le statut
  // du dossier (sans ça, un upload raté bloquerait le type définitivement).
  const isRetry = current?.status === 'AWAITING_UPLOAD'

  // Re-soumission (D4) : uniquement pour remplacer une pièce REJECTED, et dans
  // la limite de MAX_RESUBMISSIONS.
  const isResubmission = Boolean(current) && !isRetry
  if (current && !isRetry) {
    if (application.status !== 'RESUBMISSION_PENDING') throw new Error('DOCUMENT_ALREADY_SUBMITTED')
    if (current.status !== 'REJECTED') throw new Error('DOCUMENT_NOT_REJECTED')
    // D4 : `resubmissionCount < MAX` sur la pièce courante — 3 re-soumissions
    // possibles (compteurs 1, 2, 3), la 4e est refusée.
    if (current.resubmissionCount >= MAX_RESUBMISSIONS) throw new Error('MAX_RESUBMISSIONS_REACHED')
  }

  const resubmissionCount = !current ? 0 : isRetry ? current.resubmissionCount : current.resubmissionCount + 1
  const ext = MIME_EXTENSIONS[input.mimeType] ?? 'bin'
  const s3Key = `trainer-documents/${application.id}/${input.type}-v${resubmissionCount}-${crypto.randomUUID()}.${ext}`

  const { uploadUrl, expiresAt } = await presignUpload(s3Key, input.mimeType, input.sizeBytes)

  // D0/D4 — bascule atomique : l'ancienne pièce sort de `isCurrent` dans la
  // même transaction que la création de la nouvelle, pour qu'aucune lecture
  // concurrente ne voie deux pièces courantes du même type.
  const document = await db.$transaction(async (tx) => {
    if (current) {
      await tx.trainerDocument.update({ where: { id: current.id }, data: { isCurrent: false } })
    }
    const created = await tx.trainerDocument.create({
      data: {
        applicationId: application.id,
        type: input.type,
        status: 'AWAITING_UPLOAD',
        isCurrent: true,
        s3Key,
        sha256: input.sha256,
        sizeBytes: input.sizeBytes,
        mimeType: input.mimeType,
        originalFileName: input.originalFileName ?? null,
        resubmissionCount,
      },
    })
    await audit(tx, {
      actorId: userId, actorRole: 'PENDING_TRAINER',
      action: isResubmission ? 'TRAINER_DOCUMENT_RESUBMITTED' : 'TRAINER_DOCUMENT_UPLOAD_REQUESTED',
      targetType: 'TrainerDocument', targetId: created.id,
      meta: { applicationId: application.id, type: input.type, resubmissionCount, sizeBytes: input.sizeBytes, retry: isRetry },
    })
    return created
  })

  return { documentId: document.id, uploadUrl, s3Key, expiresAt, resubmissionCount }
}

// ==========================================================================
// D1 — AWAITING_UPLOAD → PENDING / RESUBMITTED (confirmation)
// ==========================================================================

export async function confirmDocumentUpload(userId: string, documentId: string) {
  const document = await db.trainerDocument.findUnique({
    where: { id: documentId },
    include: { application: { select: { id: true, userId: true, status: true } } },
  })
  if (!document) throw new Error('DOCUMENT_NOT_FOUND')
  if (document.application.userId !== userId) throw new Error('NOT_OWNER')
  if (document.status !== 'AWAITING_UPLOAD') throw new Error('DOCUMENT_NOT_AWAITING_UPLOAD')

  // Vérification du contenu réellement déposé : HeadObject + lecture des 4 Ko
  // de tête + contrôle du magic number. Sans R2 configuré (dev), aucun objet
  // n'a pu être téléversé : on saute la vérification plutôt que de la faire
  // échouer artificiellement.
  if (isS3Configured()) {
    await validateMagicNumber(document.s3Key, document.mimeType ?? '')
  }

  // Une pièce re-soumise reste distinguable d'une première soumission.
  const status: TrainerDocumentStatus = document.resubmissionCount > 0 ? 'RESUBMITTED' : 'PENDING'

  return db.$transaction(async (tx) => {
    const updated = await tx.trainerDocument.update({
      where: { id: documentId },
      data: { status },
    })
    await tx.trainerDocumentReviewEvent.create({
      data: { documentId, fromStatus: 'AWAITING_UPLOAD', toStatus: status, actorId: userId },
    })
    await audit(tx, {
      actorId: userId, actorRole: 'PENDING_TRAINER',
      action: 'TRAINER_DOCUMENT_CONFIRMED', targetType: 'TrainerDocument', targetId: documentId,
      meta: { applicationId: document.applicationId, type: document.type, status, verified: isS3Configured() },
    })
    return updated
  })
}

// ==========================================================================
// D2 / D3 / D5 / D6 — décisions de la Modération sur les pièces
// ==========================================================================

/** D2 / D5 — toutes les pièces courantes encore en attente passent APPROVED. */
export async function approveCurrentDocuments(
  tx: PrismaTransaction,
  applicationId: string,
  actorId: string,
): Promise<number> {
  const documents = await tx.trainerDocument.findMany({
    where: { applicationId, isCurrent: true, status: { in: CONFIRMED_DOCUMENT_STATUSES } },
    select: { id: true, status: true },
  })
  for (const doc of documents) {
    await tx.trainerDocument.update({
      where: { id: doc.id },
      data: { status: 'APPROVED', reviewedById: actorId, reviewedAt: new Date() },
    })
    await tx.trainerDocumentReviewEvent.create({
      data: { documentId: doc.id, fromStatus: doc.status, toStatus: 'APPROVED', actorId },
    })
  }
  return documents.length
}

/** D3 / D6 — rejet ciblé de pièces, avec motif obligatoire par pièce. */
export async function rejectDocumentsInTx(
  tx: PrismaTransaction,
  applicationId: string,
  actorId: string,
  rejections: { documentId: string; rejectionReason: string }[],
): Promise<string[]> {
  const rejectedIds: string[] = []

  for (const rejection of rejections) {
    const doc = await tx.trainerDocument.findUnique({
      where: { id: rejection.documentId },
      select: { id: true, applicationId: true, isCurrent: true, status: true, resubmissionCount: true },
    })
    if (!doc || doc.applicationId !== applicationId || !doc.isCurrent) throw new Error('DOCUMENT_NOT_FOUND')
    if (!CONFIRMED_DOCUMENT_STATUSES.includes(doc.status)) throw new Error('DOCUMENT_NOT_REVIEWABLE')

    // Une pièce qui a épuisé ses renvois ne peut plus être refusée partiellement :
    // le candidat se heurterait à `MAX_RESUBMISSIONS_REACHED` au moment de la
    // renvoyer, et le dossier resterait bloqué en RESUBMISSION_PENDING sans issue.
    // La spec prévoit le rejet définitif (T6) pour ce cas, pas un tour de plus.
    if (doc.resubmissionCount >= MAX_RESUBMISSIONS) throw new Error('MAX_RESUBMISSIONS_REACHED')

    await tx.trainerDocument.update({
      where: { id: doc.id },
      data: {
        status: 'REJECTED',
        rejectionReason: rejection.rejectionReason,
        reviewedById: actorId,
        reviewedAt: new Date(),
      },
    })
    await tx.trainerDocumentReviewEvent.create({
      data: {
        documentId: doc.id, fromStatus: doc.status, toStatus: 'REJECTED',
        actorId, rejectionReason: rejection.rejectionReason,
      },
    })
    rejectedIds.push(doc.id)
  }

  return rejectedIds
}

// ==========================================================================
// Consultation d'une pièce (Modération) — URL signée 5 min, journalisée
// ==========================================================================

export async function getDocumentViewUrl(documentId: string, actor: { id: string; adminRole: string }) {
  const document = await db.trainerDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true, applicationId: true, type: true, s3Key: true, mimeType: true,
      purgedAt: true, originalFileName: true,
    },
  })
  if (!document) throw new Error('DOCUMENT_NOT_FOUND')
  if (document.purgedAt) throw new Error('DOCUMENT_PURGED')

  const url = await presignDownload(document.s3Key)

  // §3.2 — la consultation n'est journalisée qu'ici, au moment où l'URL signée
  // est réellement délivrée (la redirection 302).
  await auditStandalone({
    actorId: actor.id, actorRole: actor.adminRole,
    action: 'TRAINER_DOCUMENT_VIEW', targetType: 'TrainerDocument', targetId: documentId,
    meta: { applicationId: document.applicationId, type: document.type, ttlSeconds: SIGNED_URL_TTL_SECONDS },
  })

  return { url, expiresInSeconds: SIGNED_URL_TTL_SECONDS }
}

// ==========================================================================
// D7 — purge après 90 jours (job quotidien)
// ==========================================================================

export async function purgeExpiredTrainerDocuments(): Promise<{ purged: number; documentIds: string[] }> {
  const threshold = new Date(Date.now() - DOCUMENT_RETENTION_DAYS * 86_400_000)

  const expired = await db.trainerDocument.findMany({
    where: {
      purgedAt: null,
      application: {
        status: { in: ['APPROVED', 'REJECTED'] },
        OR: [
          { approvedAt: { lte: threshold } },
          { rejectedAt: { lte: threshold } },
        ],
      },
    },
    select: { id: true, s3Key: true, applicationId: true, type: true },
  })

  const documentIds: string[] = []
  for (const doc of expired) {
    // L'objet R2 part en premier : si la suppression échoue, la ligne n'est pas
    // marquée purgée et le job réessaiera au prochain passage.
    await deleteObject(doc.s3Key)

    // `s3Key` et `sha256` ne sont pas nullables au schéma : on les vide plutôt
    // que de supprimer la ligne, pour conserver la trace de la décision.
    await db.trainerDocument.update({
      where: { id: doc.id },
      data: { purgedAt: new Date(), s3Key: '', sha256: '', originalFileName: null },
    })
    await auditStandalone({
      action: 'TRAINER_DOCUMENT_PURGED', targetType: 'TrainerDocument', targetId: doc.id,
      meta: { applicationId: doc.applicationId, type: doc.type, retentionDays: DOCUMENT_RETENTION_DAYS },
    })
    documentIds.push(doc.id)
  }

  return { purged: documentIds.length, documentIds }
}
