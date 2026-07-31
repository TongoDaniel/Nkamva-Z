// ==========================================================================
// Lot 1 — Tests d'invariants (validation formateurs)
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import {
  createApplication, submitApplication, approveApplication,
  rejectDocumentsPartial, rejectApplicationFinal, reopenApplication,
} from '@/lib/trainer-applications'
import { presignDocumentUpload, confirmDocumentUpload, MAX_RESUBMISSIONS } from '@/lib/trainer-documents'

describe('Lot 1 — Validation formateurs', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function createLearner() {
    return prisma.user.create({ data: { email: `learner-${crypto.randomUUID()}@test.com`, role: 'LEARNER' } })
  }
  async function createModerationAdmin() {
    return prisma.user.create({ data: { email: `mod-${crypto.randomUUID()}@test.com`, role: 'ADMIN', adminRole: 'MODERATION' } })
  }
  async function createSuperAdmin() {
    return prisma.user.create({ data: { email: `super-${crypto.randomUUID()}@test.com`, role: 'ADMIN', adminRole: 'SUPER_ADMIN' } })
  }

  const TYPES = ['ID_CARD', 'DIPLOMA', 'VIDEO'] as const

  // Upload + confirme les 3 documents requis pour une candidature DRAFT.
  async function fillRequiredDocuments(applicationId: string, userId: string) {
    for (const type of TYPES) {
      const { documentId } = await presignDocumentUpload(applicationId, userId, type, type === 'VIDEO' ? 'video/mp4' : 'application/pdf', 1024)
      await confirmDocumentUpload(documentId, userId)
    }
  }

  async function createSubmittedApplication() {
    const learner = await createLearner()
    const { id: applicationId } = await createApplication(learner.id)
    await fillRequiredDocuments(applicationId, learner.id)
    await submitApplication(applicationId, learner.id)
    const application = await prisma.trainerApplication.findUniqueOrThrow({ where: { id: applicationId } })
    return { learner, application }
  }

  // -------------------------------------------------------------------------
  it('T2 : bascule LEARNER → PENDING_TRAINER à la soumission', async () => {
    const { learner, application } = await createSubmittedApplication()

    expect(application.status).toBe('SUBMITTED')
    expect(application.submittedAt).not.toBeNull()

    const user = await prisma.user.findUniqueOrThrow({ where: { id: learner.id } })
    expect(user.role).toBe('PENDING_TRAINER')
  })

  // -------------------------------------------------------------------------
  it('T3 : approbation → crée TrainerProfile + Wallet + bascule TRAINER', async () => {
    const { learner, application } = await createSubmittedApplication()
    const admin = await createModerationAdmin()

    await approveApplication(application.id, admin.id, application.updatedAt, 'Jean Dupont')

    const user = await prisma.user.findUniqueOrThrow({ where: { id: learner.id } })
    expect(user.role).toBe('TRAINER')

    const profile = await prisma.trainerProfile.findUniqueOrThrow({ where: { userId: learner.id } })
    expect(profile.verifiedLegalName).toBe('Jean Dupont')

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { trainerId: profile.id } })
    expect(wallet.balance).toBe(0)

    const app = await prisma.trainerApplication.findUniqueOrThrow({ where: { id: application.id } })
    expect(app.status).toBe('APPROVED')
  })

  // -------------------------------------------------------------------------
  it('T4 : rejet partiel → RESUBMISSION_PENDING + motif sur le document ciblé', async () => {
    const { application } = await createSubmittedApplication()
    const admin = await createModerationAdmin()

    const doc = await prisma.trainerDocument.findFirstOrThrow({ where: { applicationId: application.id, type: 'ID_CARD' } })
    await rejectDocumentsPartial(application.id, admin.id, application.updatedAt, [{ documentId: doc.id, reason: 'Photo illisible' }])

    const app = await prisma.trainerApplication.findUniqueOrThrow({ where: { id: application.id } })
    expect(app.status).toBe('RESUBMISSION_PENDING')

    const rejected = await prisma.trainerDocument.findUniqueOrThrow({ where: { id: doc.id } })
    expect(rejected.status).toBe('REJECTED')
    expect(rejected.rejectionReason).toBe('Photo illisible')
  })

  // -------------------------------------------------------------------------
  it('T6 : rejet définitif → User.role revient à LEARNER', async () => {
    const { learner, application } = await createSubmittedApplication()
    const admin = await createModerationAdmin()

    await rejectApplicationFinal(application.id, admin.id, application.updatedAt, 'Documents non conformes')

    const user = await prisma.user.findUniqueOrThrow({ where: { id: learner.id } })
    expect(user.role).toBe('LEARNER')

    const app = await prisma.trainerApplication.findUniqueOrThrow({ where: { id: application.id } })
    expect(app.status).toBe('REJECTED')
    expect(app.finalRejectionReason).toBe('Documents non conformes')
  })

  // -------------------------------------------------------------------------
  it('T8 : réouverture → User repasse PENDING_TRAINER (Super-admin uniquement)', async () => {
    const { learner, application } = await createSubmittedApplication()
    const admin = await createModerationAdmin()
    const superAdmin = await createSuperAdmin()

    await rejectApplicationFinal(application.id, admin.id, application.updatedAt, 'Documents non conformes')
    // Simule les 24h de délai minimum écoulées (Lot 1 §3.1 T8)
    await prisma.trainerApplication.update({ where: { id: application.id }, data: { rejectedAt: new Date(Date.now() - 25 * 3600000) } })

    await reopenApplication(application.id, superAdmin.id)

    const user = await prisma.user.findUniqueOrThrow({ where: { id: learner.id } })
    expect(user.role).toBe('PENDING_TRAINER')

    const app = await prisma.trainerApplication.findUniqueOrThrow({ where: { id: application.id } })
    expect(app.status).toBe('RESUBMISSION_PENDING')
    expect(app.reopenedById).toBe(superAdmin.id)

    // Une seconde réouverture est impossible (reopenedById déjà renseigné)
    await expect(reopenApplication(application.id, superAdmin.id)).rejects.toThrow('REOPEN_IMPOSSIBLE')
  })

  // -------------------------------------------------------------------------
  it('re-soumission atomique : isCurrent bascule sur la nouvelle ligne', async () => {
    const { learner, application } = await createSubmittedApplication()
    const admin = await createModerationAdmin()

    const oldDoc = await prisma.trainerDocument.findFirstOrThrow({ where: { applicationId: application.id, type: 'ID_CARD' } })
    await rejectDocumentsPartial(application.id, admin.id, application.updatedAt, [{ documentId: oldDoc.id, reason: 'Photo illisible' }])

    const { documentId: newDocId } = await presignDocumentUpload(application.id, learner.id, 'ID_CARD', 'application/pdf', 2048)
    await confirmDocumentUpload(newDocId, learner.id)

    const oldAfter = await prisma.trainerDocument.findUniqueOrThrow({ where: { id: oldDoc.id } })
    expect(oldAfter.isCurrent).toBe(false)

    const newDoc = await prisma.trainerDocument.findUniqueOrThrow({ where: { id: newDocId } })
    expect(newDoc.isCurrent).toBe(true)
    expect(newDoc.resubmissionCount).toBe(1)
    expect(newDoc.status).toBe('RESUBMITTED')

    // T5 automatique : plus aucun document REJECTED → le dossier repasse SUBMITTED
    const app = await prisma.trainerApplication.findUniqueOrThrow({ where: { id: application.id } })
    expect(app.status).toBe('SUBMITTED')
  })

  // -------------------------------------------------------------------------
  it(`limite MAX_RESUBMISSIONS (${MAX_RESUBMISSIONS}) : au-delà, blocage`, async () => {
    const { learner, application } = await createSubmittedApplication()
    const admin = await createModerationAdmin()

    let docId = (await prisma.trainerDocument.findFirstOrThrow({ where: { applicationId: application.id, type: 'ID_CARD' } })).id

    for (let i = 0; i < MAX_RESUBMISSIONS; i++) {
      const app = await prisma.trainerApplication.findUniqueOrThrow({ where: { id: application.id } })
      await rejectDocumentsPartial(application.id, admin.id, app.updatedAt, [{ documentId: docId, reason: `Rejet ${i + 1}` }])
      const { documentId: newDocId } = await presignDocumentUpload(application.id, learner.id, 'ID_CARD', 'application/pdf', 2048)
      await confirmDocumentUpload(newDocId, learner.id)
      docId = newDocId
    }

    const finalDoc = await prisma.trainerDocument.findUniqueOrThrow({ where: { id: docId } })
    expect(finalDoc.resubmissionCount).toBe(MAX_RESUBMISSIONS)

    // La candidature est repassée SUBMITTED (plus aucun doc REJECTED) — un 4e rejet est bloqué
    const app = await prisma.trainerApplication.findUniqueOrThrow({ where: { id: application.id } })
    expect(app.status).toBe('SUBMITTED')

    await expect(
      rejectDocumentsPartial(application.id, admin.id, app.updatedAt, [{ documentId: docId, reason: 'Encore illisible' }]),
    ).rejects.toThrow('MAX_RESUBMISSIONS_REACHED')
  })
})
