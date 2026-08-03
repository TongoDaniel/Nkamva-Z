// ==========================================================================
// Lot 1 — Invariants de la validation des formateurs
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  createApplication, submitApplication, approveApplication,
  rejectDocuments, rejectApplicationFinal, reopenApplication,
  getApplicationStats,
} from '@/lib/trainer-applications'
import {
  requestDocumentUpload, confirmDocumentUpload, getDocumentViewUrl,
  purgeExpiredTrainerDocuments, MAX_RESUBMISSIONS, REQUIRED_DOCUMENT_TYPES,
} from '@/lib/trainer-documents'
import type { TrainerDocumentType } from '@prisma/client'

const SHA = 'a'.repeat(64)

const MIME_BY_TYPE: Record<TrainerDocumentType, string> = {
  ID_CARD: 'application/pdf',
  DIPLOMA: 'application/pdf',
  VIDEO: 'video/mp4',
}

describe('Lot 1 — Validation des formateurs', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function setupCandidate() {
    const user = await prisma.user.create({
      data: { email: 'candidat@test.com', fullName: 'Jean Candidat', role: 'LEARNER' },
    })
    const admin = await prisma.user.create({
      data: { email: 'moderation@test.com', role: 'ADMIN', adminRole: 'MODERATION' },
    })
    const superAdmin = await prisma.user.create({
      data: { email: 'super@test.com', role: 'ADMIN', adminRole: 'SUPER_ADMIN' },
    })
    const application = await createApplication(user.id, {
      slogan: 'Apprenez le code', description: 'Formateur Node.js', domains: ['dev'], experienceYears: 8,
    })
    return { user, admin, superAdmin, application }
  }

  /** Dépose et confirme les 3 pièces obligatoires. */
  async function uploadAllDocuments(userId: string) {
    for (const type of REQUIRED_DOCUMENT_TYPES) {
      const { documentId } = await requestDocumentUpload(userId, {
        type, mimeType: MIME_BY_TYPE[type], sizeBytes: 1024, sha256: SHA,
      })
      await confirmDocumentUpload(userId, documentId)
    }
  }

  async function freshUpdatedAt(applicationId: string) {
    const app = await prisma.trainerApplication.findUniqueOrThrow({ where: { id: applicationId } })
    return app.updatedAt.toISOString()
  }

  /** Rejette la pièce courante d'un type et renvoie le dossier en re-soumission. */
  async function rejectCurrentDocument(applicationId: string, type: TrainerDocumentType, adminId: string) {
    const doc = await prisma.trainerDocument.findFirstOrThrow({
      where: { applicationId, type, isCurrent: true },
    })
    return rejectDocuments(applicationId, {
      rejections: [{ documentId: doc.id, rejectionReason: 'Pièce illisible, merci de renvoyer.' }],
      expectedUpdatedAt: await freshUpdatedAt(applicationId),
      actorId: adminId,
    })
  }

  // -------------------------------------------------------------------------
  it('T1 — création : le dossier est DRAFT et le rôle reste LEARNER', async () => {
    const { user, application } = await setupCandidate()

    expect(application.status).toBe('DRAFT')
    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(refreshed.role).toBe('LEARNER')

    // Un second dossier non rejeté est refusé
    await expect(createApplication(user.id, {})).rejects.toThrow('APPLICATION_ALREADY_EXISTS')
  })

  // -------------------------------------------------------------------------
  it('T2 — soumission : bascule LEARNER → PENDING_TRAINER et invalide les sessions', async () => {
    const { user, application } = await setupCandidate()

    // Sans les 3 pièces, la soumission est refusée
    await expect(submitApplication(user.id)).rejects.toThrow('DOCUMENTS_INCOMPLETE')

    const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    await uploadAllDocuments(user.id)
    const submitted = await submitApplication(user.id)

    expect(submitted.status).toBe('SUBMITTED')
    expect(submitted.submittedAt).not.toBeNull()

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(after.role).toBe('PENDING_TRAINER')
    // Le JWT porte le rôle : il ne doit pas survivre à la bascule
    expect(after.sessionsValidAfter.getTime()).toBeGreaterThan(before.sessionsValidAfter.getTime())

    const events = await prisma.trainerApplicationReviewEvent.findMany({ where: { applicationId: application.id } })
    expect(events).toHaveLength(1)
    expect(events[0].toStatus).toBe('SUBMITTED')
  })

  // -------------------------------------------------------------------------
  it('T3 — approbation : crée TrainerProfile + Wallet et bascule en TRAINER', async () => {
    const { user, admin, application } = await setupCandidate()
    await uploadAllDocuments(user.id)
    await submitApplication(user.id)

    const approved = await approveApplication(application.id, {
      verifiedLegalName: 'Jean Candidat',
      expectedUpdatedAt: await freshUpdatedAt(application.id),
      actorId: admin.id,
    })
    expect(approved.status).toBe('APPROVED')
    expect(approved.approvedAt).not.toBeNull()

    const profile = await prisma.trainerProfile.findUniqueOrThrow({ where: { userId: user.id } })
    expect(profile.verifiedLegalName).toBe('Jean Candidat')
    // Le portefeuille naît dans la même transaction : pas de TRAINER sans wallet
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { trainerId: profile.id } })
    expect(wallet.balance).toBe(0)

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(refreshed.role).toBe('TRAINER')

    // Toutes les pièces courantes sont passées APPROVED
    const docs = await prisma.trainerDocument.findMany({ where: { applicationId: application.id, isCurrent: true } })
    expect(docs).toHaveLength(3)
    expect(docs.every(d => d.status === 'APPROVED')).toBe(true)
  })

  // -------------------------------------------------------------------------
  it('T3 — approbation avec expectedUpdatedAt périmé → STALE_APPLICATION', async () => {
    const { user, admin, application } = await setupCandidate()
    await uploadAllDocuments(user.id)
    await submitApplication(user.id)

    await expect(approveApplication(application.id, {
      verifiedLegalName: 'Jean Candidat',
      expectedUpdatedAt: new Date(Date.now() - 3600_000).toISOString(),
      actorId: admin.id,
    })).rejects.toThrow('STALE_APPLICATION')

    // Rien n'a été créé
    expect(await prisma.trainerProfile.count()).toBe(0)
    expect(await prisma.wallet.count()).toBe(0)
    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(refreshed.role).toBe('PENDING_TRAINER')
  })

  // -------------------------------------------------------------------------
  it('T4 — rejet partiel : dossier RESUBMISSION_PENDING, pièce REJECTED avec motif', async () => {
    const { user, admin, application } = await setupCandidate()
    await uploadAllDocuments(user.id)
    await submitApplication(user.id)

    const updated = await rejectCurrentDocument(application.id, 'ID_CARD', admin.id)
    expect(updated.status).toBe('RESUBMISSION_PENDING')

    const idCard = await prisma.trainerDocument.findFirstOrThrow({
      where: { applicationId: application.id, type: 'ID_CARD', isCurrent: true },
    })
    expect(idCard.status).toBe('REJECTED')
    expect(idCard.rejectionReason).toBe('Pièce illisible, merci de renvoyer.')

    // Les autres pièces ne sont pas touchées : rien à renvoyer pour elles
    const diploma = await prisma.trainerDocument.findFirstOrThrow({
      where: { applicationId: application.id, type: 'DIPLOMA', isCurrent: true },
    })
    expect(diploma.status).toBe('PENDING')

    // Le rôle reste PENDING_TRAINER pendant la re-soumission
    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(refreshed.role).toBe('PENDING_TRAINER')

    // Tant que la pièce refusée n'est pas renvoyée, impossible de re-soumettre
    await expect(submitApplication(user.id)).rejects.toThrow('DOCUMENTS_INCOMPLETE')

    // Une fois la seule pièce refusée renvoyée, le dossier repart : les pièces
    // restées PENDING ne bloquent pas la re-soumission (T5).
    const { documentId } = await requestDocumentUpload(user.id, {
      type: 'ID_CARD', mimeType: 'application/pdf', sizeBytes: 1024, sha256: SHA,
    })
    await confirmDocumentUpload(user.id, documentId)
    const resubmitted = await submitApplication(user.id)
    expect(resubmitted.status).toBe('SUBMITTED')
  })

  // -------------------------------------------------------------------------
  it('T3 / T4 — une décision ne porte que sur un dossier soumis', async () => {
    const { user, admin, application } = await setupCandidate()

    // Le dossier est encore DRAFT : rien n'est instruisible.
    await expect(approveApplication(application.id, {
      verifiedLegalName: 'Kwame Mensah',
      expectedUpdatedAt: await freshUpdatedAt(application.id),
      actorId: admin.id,
    })).rejects.toThrow('APPLICATION_NOT_SUBMITTED')

    await uploadAllDocuments(user.id)
    await submitApplication(user.id)

    // Un rejet partiel sans aucune pièce désignée n'a pas de sens : il
    // renverrait le dossier au candidat sans rien lui demander.
    await expect(rejectDocuments(application.id, {
      rejections: [],
      expectedUpdatedAt: await freshUpdatedAt(application.id),
      actorId: admin.id,
    })).rejects.toThrow('NO_DOCUMENT_REJECTED')
  })

  // -------------------------------------------------------------------------
  it('D4 — re-soumission atomique : isCurrent bascule, une seule pièce courante', async () => {
    const { user, admin, application } = await setupCandidate()
    await uploadAllDocuments(user.id)
    await submitApplication(user.id)
    await rejectCurrentDocument(application.id, 'ID_CARD', admin.id)

    const oldDoc = await prisma.trainerDocument.findFirstOrThrow({
      where: { applicationId: application.id, type: 'ID_CARD', isCurrent: true },
    })

    const { documentId } = await requestDocumentUpload(user.id, {
      type: 'ID_CARD', mimeType: 'application/pdf', sizeBytes: 2048, sha256: SHA,
    })
    await confirmDocumentUpload(user.id, documentId)

    // L'ancienne sort de isCurrent, la nouvelle la remplace
    const archived = await prisma.trainerDocument.findUniqueOrThrow({ where: { id: oldDoc.id } })
    expect(archived.isCurrent).toBe(false)
    expect(archived.status).toBe('REJECTED')

    const current = await prisma.trainerDocument.findMany({
      where: { applicationId: application.id, type: 'ID_CARD', isCurrent: true },
    })
    expect(current).toHaveLength(1)
    expect(current[0].id).toBe(documentId)
    expect(current[0].status).toBe('RESUBMITTED')
    expect(current[0].resubmissionCount).toBe(1)

    // T5 — la re-soumission complète renvoie le dossier en instruction
    const resubmitted = await submitApplication(user.id)
    expect(resubmitted.status).toBe('SUBMITTED')
  })

  // -------------------------------------------------------------------------
  it('D4 — MAX_RESUBMISSIONS : 3 renvois possibles, le 4e est bloqué', async () => {
    const { user, admin, application } = await setupCandidate()
    await uploadAllDocuments(user.id)
    await submitApplication(user.id)

    for (let attempt = 1; attempt <= MAX_RESUBMISSIONS; attempt++) {
      await rejectCurrentDocument(application.id, 'ID_CARD', admin.id)
      const { documentId } = await requestDocumentUpload(user.id, {
        type: 'ID_CARD', mimeType: 'application/pdf', sizeBytes: 1024, sha256: SHA,
      })
      await confirmDocumentUpload(user.id, documentId)
      const doc = await prisma.trainerDocument.findUniqueOrThrow({ where: { id: documentId } })
      expect(doc.resubmissionCount).toBe(attempt)
      await submitApplication(user.id)
    }

    // 4e tour : le blocage tombe sur l'admin, pas sur le candidat. Refuser une
    // quatrième fois enfermerait le dossier en RESUBMISSION_PENDING sans issue —
    // le candidat se heurterait à MAX_RESUBMISSIONS_REACHED en le renvoyant.
    await expect(rejectCurrentDocument(application.id, 'ID_CARD', admin.id))
      .rejects.toThrow('MAX_RESUBMISSIONS_REACHED')

    // La pièce reste donc instruisible, et la seule sortie est le rejet
    // définitif (T6) — que rien ne bloque.
    const stillPending = await prisma.trainerDocument.findFirstOrThrow({
      where: { applicationId: application.id, type: 'ID_CARD', isCurrent: true },
    })
    expect(stillPending.status).toBe('RESUBMITTED')
    expect(stillPending.resubmissionCount).toBe(MAX_RESUBMISSIONS)

    await rejectApplicationFinal(application.id, {
      reason: 'Pièce d\'identité illisible après trois renvois successifs.',
      expectedUpdatedAt: await freshUpdatedAt(application.id),
      actorId: admin.id,
    })
    const closed = await prisma.trainerApplication.findUniqueOrThrow({ where: { id: application.id } })
    expect(closed.status).toBe('REJECTED')
  })

  // -------------------------------------------------------------------------
  // Filet de sécurité conservé côté candidat : la garde de `requestDocumentUpload`
  // n'est plus atteignable par le parcours normal depuis que le rejet est bloqué
  // en amont, mais elle protège toute nouvelle voie d'écriture.
  it('D4 — une pièce à MAX_RESUBMISSIONS ne peut plus être renvoyée', async () => {
    const { user, application } = await setupCandidate()
    await uploadAllDocuments(user.id)

    // L'état est posé directement : le parcours normal ne peut plus y mener,
    // c'est précisément ce que cette garde de dernier recours doit couvrir.
    await prisma.trainerApplication.update({
      where: { id: application.id },
      data: { status: 'RESUBMISSION_PENDING' },
    })
    await prisma.trainerDocument.updateMany({
      where: { applicationId: application.id, type: 'ID_CARD', isCurrent: true },
      data: { status: 'REJECTED', resubmissionCount: MAX_RESUBMISSIONS },
    })

    await expect(requestDocumentUpload(user.id, {
      type: 'ID_CARD', mimeType: 'application/pdf', sizeBytes: 1024, sha256: SHA,
    })).rejects.toThrow('MAX_RESUBMISSIONS_REACHED')
  })

  // -------------------------------------------------------------------------
  // Un presign jamais confirmé (upload abandonné ou échoué côté R2) ne doit pas
  // bloquer définitivement le type de pièce : c'est une reprise, pas une
  // re-soumission, et elle ne consomme aucun compteur.
  it('D0 — un upload abandonné peut être repris sans consommer de re-soumission', async () => {
    const { user, application } = await setupCandidate()

    const first = await requestDocumentUpload(user.id, {
      type: 'ID_CARD', mimeType: 'application/pdf', sizeBytes: 1024, sha256: SHA,
    })
    // Aucune confirmation : la pièce reste AWAITING_UPLOAD.

    const retry = await requestDocumentUpload(user.id, {
      type: 'ID_CARD', mimeType: 'application/pdf', sizeBytes: 2048, sha256: SHA,
    })
    expect(retry.documentId).not.toBe(first.documentId)
    expect(retry.resubmissionCount).toBe(0)

    const current = await prisma.trainerDocument.findMany({
      where: { applicationId: application.id, type: 'ID_CARD', isCurrent: true },
    })
    expect(current).toHaveLength(1)
    expect(current[0].id).toBe(retry.documentId)

    // La reprise reste confirmable et le dossier reste soumissible
    await confirmDocumentUpload(user.id, retry.documentId)
    for (const type of ['DIPLOMA', 'VIDEO'] as TrainerDocumentType[]) {
      const { documentId } = await requestDocumentUpload(user.id, {
        type, mimeType: MIME_BY_TYPE[type], sizeBytes: 1024, sha256: SHA,
      })
      await confirmDocumentUpload(user.id, documentId)
    }
    expect((await submitApplication(user.id)).status).toBe('SUBMITTED')
  })

  // -------------------------------------------------------------------------
  it('T6 — rejet définitif : le rôle redescend à LEARNER', async () => {
    const { user, admin, application } = await setupCandidate()
    await uploadAllDocuments(user.id)
    await submitApplication(user.id)

    const rejected = await rejectApplicationFinal(application.id, {
      reason: 'Documents non authentiques après vérification.',
      expectedUpdatedAt: await freshUpdatedAt(application.id),
      actorId: admin.id,
    })
    expect(rejected.status).toBe('REJECTED')
    expect(rejected.rejectedAt).not.toBeNull()
    expect(rejected.finalRejectionReason).toBe('Documents non authentiques après vérification.')

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(refreshed.role).toBe('LEARNER')

    // Aucun profil formateur n'a été créé
    expect(await prisma.trainerProfile.count()).toBe(0)
  })

  // -------------------------------------------------------------------------
  it('T8 — réouverture Super-admin : 4 conditions, puis retour en PENDING_TRAINER', async () => {
    const { user, admin, superAdmin, application } = await setupCandidate()
    await uploadAllDocuments(user.id)
    await submitApplication(user.id)
    await rejectApplicationFinal(application.id, {
      reason: 'Dossier incomplet après instruction.',
      expectedUpdatedAt: await freshUpdatedAt(application.id),
      actorId: admin.id,
    })

    // Condition 3 : le rejet doit dater d'au moins 24 h
    await expect(reopenApplication(application.id, superAdmin.id)).rejects.toThrow('REOPEN_TOO_EARLY')

    await prisma.trainerApplication.update({
      where: { id: application.id },
      data: { rejectedAt: new Date(Date.now() - 25 * 3600_000) },
    })

    const reopened = await reopenApplication(application.id, superAdmin.id)
    expect(reopened.status).toBe('RESUBMISSION_PENDING')
    expect(reopened.reopenedById).toBe(superAdmin.id)

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(refreshed.role).toBe('PENDING_TRAINER')

    // Condition 2 : une seule réouverture par dossier
    await expect(reopenApplication(application.id, superAdmin.id)).rejects.toThrow('APPLICATION_NOT_REJECTED')
  })

  // -------------------------------------------------------------------------
  it('D7 — purge à 90 jours : objet supprimé, champs vidés, réouverture impossible', async () => {
    const { user, admin, superAdmin, application } = await setupCandidate()
    await uploadAllDocuments(user.id)
    await submitApplication(user.id)
    await rejectApplicationFinal(application.id, {
      reason: 'Dossier rejeté, conservation 90 jours.',
      expectedUpdatedAt: await freshUpdatedAt(application.id),
      actorId: admin.id,
    })

    // Décision datant de moins de 90 jours : rien à purger
    expect((await purgeExpiredTrainerDocuments()).purged).toBe(0)

    await prisma.trainerApplication.update({
      where: { id: application.id },
      data: { rejectedAt: new Date(Date.now() - 91 * 86400000) },
    })

    const { purged } = await purgeExpiredTrainerDocuments()
    expect(purged).toBe(3)

    const docs = await prisma.trainerDocument.findMany({ where: { applicationId: application.id } })
    expect(docs.every(d => d.purgedAt !== null)).toBe(true)
    expect(docs.every(d => d.s3Key === '' && d.sha256 === '')).toBe(true)

    // Le job est idempotent
    expect((await purgeExpiredTrainerDocuments()).purged).toBe(0)

    // Les pièces sont irrécupérables : la réouverture n'a plus de sens
    await expect(reopenApplication(application.id, superAdmin.id)).rejects.toThrow('REOPEN_IMPOSSIBLE')
  })

  // -------------------------------------------------------------------------
  it('la consultation d\'une pièce est journalisée, une pièce purgée est refusée', async () => {
    const { user, admin, application } = await setupCandidate()
    await uploadAllDocuments(user.id)
    await submitApplication(user.id)

    const doc = await prisma.trainerDocument.findFirstOrThrow({
      where: { applicationId: application.id, type: 'ID_CARD', isCurrent: true },
    })

    const { url, expiresInSeconds } = await getDocumentViewUrl(doc.id, { id: admin.id, adminRole: 'MODERATION' })
    expect(url).toBeTruthy()
    expect(expiresInSeconds).toBe(300)

    const views = await prisma.auditLog.count({
      where: { action: 'TRAINER_DOCUMENT_VIEW', targetId: doc.id, actorId: admin.id },
    })
    expect(views).toBe(1)

    await prisma.trainerDocument.update({ where: { id: doc.id }, data: { purgedAt: new Date() } })
    await expect(
      getDocumentViewUrl(doc.id, { id: admin.id, adminRole: 'MODERATION' }),
    ).rejects.toThrow('DOCUMENT_PURGED')
  })

  // -------------------------------------------------------------------------
  it('stats : les dossiers en attente comptent SUBMITTED + RESUBMISSION_PENDING', async () => {
    const { user, admin, application } = await setupCandidate()
    await uploadAllDocuments(user.id)
    await submitApplication(user.id)

    let stats = await getApplicationStats()
    expect(stats.pending).toBe(1)
    expect(stats.byStatus.SUBMITTED).toBe(1)

    await rejectCurrentDocument(application.id, 'DIPLOMA', admin.id)
    stats = await getApplicationStats()
    expect(stats.pending).toBe(1)
    expect(stats.byStatus.RESUBMISSION_PENDING).toBe(1)
  })
})
