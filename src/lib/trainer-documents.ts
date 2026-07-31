// ==========================================================================
// Lot 1 — Pièces d'une candidature formateur : upload présigné, confirmation,
// re-soumission atomique (D4), purge après rétention (D7)
// ==========================================================================

import { createHash } from 'node:crypto'
import { db } from './db'
import { auditStandalone } from './audit'
import { notifyAdminSubRole } from './notification'
import { presignUpload, presignDownload, headObject, getRange, validateMagicNumber, deleteObject, isS3Configured } from './s3'
import type { TrainerDocumentType } from '@prisma/client'

export const MAX_RESUBMISSIONS = 3
export const DOCUMENT_RETENTION_DAYS = 90

export const TRAINER_DOCUMENT_LIMITS: Record<TrainerDocumentType, { mimes: string[]; maxSize: number }> = {
  ID_CARD: { mimes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], maxSize: 10_485_760 },
  DIPLOMA: { mimes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], maxSize: 10_485_760 },
  VIDEO: { mimes: ['video/mp4'], maxSize: 2_147_483_648 },
}

export const TRAINER_DOCUMENT_ERRORS: Record<string, { status: number; message: string }> = {
  APPLICATION_NOT_FOUND: { status: 404, message: 'Candidature introuvable' },
  FORBIDDEN: { status: 403, message: 'Accès refusé' },
  INVALID_APPLICATION_STATUS: { status: 409, message: 'Statut de candidature invalide pour cette action' },
  MIME_NOT_ALLOWED_FOR_TYPE: { status: 400, message: 'Type MIME non autorisé pour ce type de document' },
  SIZE_EXCEEDS_TYPE_LIMIT: { status: 400, message: 'Taille du fichier dépassée' },
  DOCUMENT_ALREADY_SUBMITTED: { status: 409, message: 'Document déjà soumis' },
  MAX_RESUBMISSIONS_REACHED: { status: 422, message: '3 re-soumissions atteintes' },
  CONCURRENT_RESUBMISSION: { status: 409, message: 'Re-soumission concurrente' },
  DOCUMENT_NOT_FOUND: { status: 404, message: 'Document introuvable' },
  INVALID_DOCUMENT_STATUS: { status: 409, message: 'Statut de document invalide pour cette action' },
  UPLOAD_NOT_FOUND: { status: 400, message: "Fichier non trouvé sur le stockage" },
  DOCUMENT_PURGED: { status: 410, message: 'Document purgé après la durée de conservation' },
}

function extensionFor(mimeType: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4',
  }
  return map[mimeType] || 'bin'
}

// --- D0 : demander une URL présignée (upload initial ou re-soumission D4) ---

export async function presignDocumentUpload(
  applicationId: string,
  userId: string,
  type: TrainerDocumentType,
  mimeType: string,
  sizeBytes: number,
): Promise<{ documentId: string; uploadUrl: string; expiresAt: Date; s3Key: string }> {
  const application = await db.trainerApplication.findUnique({ where: { id: applicationId } })
  if (!application) throw new Error('APPLICATION_NOT_FOUND')
  if (application.userId !== userId) throw new Error('FORBIDDEN')
  if (!['DRAFT', 'RESUBMISSION_PENDING'].includes(application.status)) throw new Error('INVALID_APPLICATION_STATUS')

  const limits = TRAINER_DOCUMENT_LIMITS[type]
  if (!limits.mimes.includes(mimeType)) throw new Error('MIME_NOT_ALLOWED_FOR_TYPE')
  if (sizeBytes > limits.maxSize) throw new Error('SIZE_EXCEEDS_TYPE_LIMIT')

  const current = await db.trainerDocument.findFirst({ where: { applicationId, type, isCurrent: true } })

  // Upload initial : aucune ligne courante pour ce type
  if (!current) {
    const resubmissionCount = 0
    const s3Key = `trainer-documents/${applicationId}/${type}-v${resubmissionCount}-${crypto.randomUUID()}.${extensionFor(mimeType)}`
    const doc = await db.trainerDocument.create({
      data: { applicationId, type, status: 'AWAITING_UPLOAD', s3Key, sha256: '', sizeBytes, mimeType, resubmissionCount },
    })
    const { uploadUrl, expiresAt } = await presignUpload(s3Key, mimeType, sizeBytes)
    return { documentId: doc.id, uploadUrl, expiresAt, s3Key }
  }

  // Upload jamais confirmé : on retente sur la même ligne
  if (current.status === 'AWAITING_UPLOAD') {
    const { uploadUrl, expiresAt } = await presignUpload(current.s3Key, mimeType, sizeBytes)
    return { documentId: current.id, uploadUrl, expiresAt, s3Key: current.s3Key }
  }

  // D4 : re-soumission après rejet — transaction atomique (archive + nouvelle ligne)
  if (current.status !== 'REJECTED') throw new Error('DOCUMENT_ALREADY_SUBMITTED')
  if (current.resubmissionCount >= MAX_RESUBMISSIONS) throw new Error('MAX_RESUBMISSIONS_REACHED')

  const result = await db.$transaction(async (tx) => {
    const stillCurrent = await tx.trainerDocument.findUnique({ where: { id: current.id } })
    if (!stillCurrent || !stillCurrent.isCurrent || stillCurrent.status !== 'REJECTED') {
      throw new Error('CONCURRENT_RESUBMISSION')
    }
    await tx.trainerDocument.update({ where: { id: current.id }, data: { isCurrent: false } })
    const resubmissionCount = stillCurrent.resubmissionCount + 1
    const s3Key = `trainer-documents/${applicationId}/${type}-v${resubmissionCount}-${crypto.randomUUID()}.${extensionFor(mimeType)}`
    const doc = await tx.trainerDocument.create({
      data: { applicationId, type, status: 'AWAITING_UPLOAD', s3Key, sha256: '', sizeBytes, mimeType, resubmissionCount, isCurrent: true },
    })
    return doc
  })

  const { uploadUrl, expiresAt } = await presignUpload(result.s3Key, mimeType, sizeBytes)
  return { documentId: result.id, uploadUrl, expiresAt, s3Key: result.s3Key }
}

// --- D1 : confirmer l'upload (HeadObject + Range + magic number) ---

export async function confirmDocumentUpload(documentId: string, userId: string): Promise<void> {
  const doc = await db.trainerDocument.findUnique({ where: { id: documentId }, include: { application: true } })
  if (!doc) throw new Error('DOCUMENT_NOT_FOUND')
  if (doc.application.userId !== userId) throw new Error('FORBIDDEN')
  if (doc.status !== 'AWAITING_UPLOAD') throw new Error('INVALID_DOCUMENT_STATUS')

  const limits = TRAINER_DOCUMENT_LIMITS[doc.type]
  let contentLength = doc.sizeBytes
  let sha256 = ''

  if (isS3Configured()) {
    const head = await headObject(doc.s3Key)
    if (!head) throw new Error('UPLOAD_NOT_FOUND')
    if (head.contentLength > limits.maxSize) throw new Error('SIZE_EXCEEDS_TYPE_LIMIT')
    await validateMagicNumber(doc.s3Key, doc.mimeType || '')
    // Empreinte sur les 4096 premiers octets (déjà lus pour la vérification du
    // magic number) — pas un sha256 du fichier entier, dont la lecture complète
    // n'est pas requise par la validation /confirm (Lot 1 §5.5).
    const headBytes = await getRange(doc.s3Key, 0, 4095)
    sha256 = headBytes ? createHash('sha256').update(headBytes).digest('hex') : ''
    contentLength = head.contentLength
  } else {
    // Dev sans R2 : rien à vérifier côté objet, on fait confiance aux
    // métadonnées déclarées au presign (mimeType/sizeBytes déjà validés alors).
    sha256 = createHash('sha256').update(doc.s3Key).digest('hex')
  }

  const nextStatus = doc.resubmissionCount > 0 ? 'RESUBMITTED' : 'PENDING'
  await db.trainerDocument.update({ where: { id: documentId }, data: { status: nextStatus, sizeBytes: contentLength, sha256 } })
  await auditStandalone({
    actorId: userId, actorRole: 'TRAINER', action: 'TRAINER_DOCUMENT_CONFIRMED',
    targetType: 'TrainerDocument', targetId: documentId, meta: { type: doc.type, status: nextStatus },
  })

  // T5 : si c'était une re-soumission et qu'il ne reste plus aucun document REJECTED, le dossier repasse SUBMITTED
  if (nextStatus === 'RESUBMITTED' && doc.application.status === 'RESUBMISSION_PENDING') {
    const stillRejected = await db.trainerDocument.count({ where: { applicationId: doc.applicationId, isCurrent: true, status: 'REJECTED' } })
    if (stillRejected === 0) {
      await db.trainerApplication.update({ where: { id: doc.applicationId }, data: { status: 'SUBMITTED', reviewedAt: null } })
      await notifyAdminSubRole('MODERATION', {
        type: 'TRAINER_APPLICATION_RESUBMITTED', title: 'Candidature re-soumise',
        body: 'Un formateur a re-soumis les pièces demandées.', link: `/admin/validation-formateurs/${doc.applicationId}`,
      })
      await auditStandalone({
        actorId: userId, actorRole: 'TRAINER', action: 'TRAINER_APPLICATION_RESUBMITTED',
        targetType: 'TrainerApplication', targetId: doc.applicationId, meta: {},
      })
    }
  }
}

// --- Admin MODERATION/SUPER_ADMIN : consulter une pièce (302 + audit) ---
// FINANCES n'a JAMAIS accès (décision n°7) — non appelable ici, ce module ne
// vérifie pas le sous-rôle admin, c'est le rôle de la route (requireAdminSubRole).

export async function getDocumentDownloadRedirect(documentId: string, adminId: string): Promise<string> {
  const doc = await db.trainerDocument.findUnique({ where: { id: documentId } })
  if (!doc) throw new Error('DOCUMENT_NOT_FOUND')
  if (doc.purgedAt) throw new Error('DOCUMENT_PURGED')

  const url = await presignDownload(doc.s3Key)
  await auditStandalone({
    actorId: adminId, actorRole: 'MODERATION', action: 'TRAINER_DOCUMENT_VIEW',
    targetType: 'TrainerDocument', targetId: documentId, meta: { applicationId: doc.applicationId, type: doc.type },
  })
  return url
}

// --- D7 : purge des documents après rétention (job planifié quotidien 03:00 UTC) ---

export async function purgeExpiredTrainerDocuments(): Promise<number> {
  const cutoff = new Date(Date.now() - DOCUMENT_RETENTION_DAYS * 86400000)
  const expired = await db.trainerDocument.findMany({
    where: { status: { in: ['APPROVED', 'REJECTED'] }, reviewedAt: { lte: cutoff }, purgedAt: null },
  })
  for (const doc of expired) {
    await deleteObject(doc.s3Key)
    await db.trainerDocument.update({
      where: { id: doc.id },
      data: { purgedAt: new Date(), originalFileName: null, mimeType: null },
    })
    await auditStandalone({
      action: 'TRAINER_DOCUMENT_PURGED', targetType: 'TrainerDocument', targetId: doc.id,
      meta: { applicationId: doc.applicationId, s3Key: doc.s3Key },
    })
  }
  return expired.length
}
