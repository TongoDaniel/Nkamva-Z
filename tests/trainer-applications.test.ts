// ==========================================================================
// Lot 1 — Candidature formateur, côté candidat (T1, T2, T5, D0, D4)
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { TrainerDocumentType } from '@prisma/client'
import { prisma, cleanDatabase } from './setup'
import {
  createApplication,
  updateApplication,
  getMyApplication,
  requestDocumentUpload,
  confirmDocumentUpload,
  submitApplication,
  missingDocuments,
  REQUIRED_DOCUMENTS,
  MAX_RESUBMISSIONS,
} from '@/lib/trainer-applications'

const VALID_APPLICATION = {
  slogan: 'Le back-end sans mystère',
  description: "J'accompagne les équipes africaines vers des architectures qui tiennent la charge.",
  domains: ['Développement'],
  experienceYears: 12,
}

async function expectFailure(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toThrow(code)
}

describe('Lot 1 — Candidature formateur', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function makeLearner(email = 'candidat@test.com') {
    return prisma.user.create({ data: { email, fullName: 'Kwame Mensah', role: 'LEARNER' } })
  }

  /** Pose une pièce déjà confirmée : D0/D1 exigent un stockage objet réel. */
  async function seedConfirmedDocument(
    applicationId: string,
    type: TrainerDocumentType,
    overrides: { status?: 'PENDING' | 'RESUBMITTED' | 'REJECTED' | 'APPROVED'; resubmissionCount?: number } = {},
  ) {
    return prisma.trainerDocument.create({
      data: {
        applicationId,
        type,
        status: overrides.status ?? 'PENDING',
        isCurrent: true,
        s3Key: `trainer-documents/${applicationId}/${type}-v0-${crypto.randomUUID()}.pdf`,
        sha256: 'sha256:factice',
        sizeBytes: 1024,
        mimeType: type === 'VIDEO' ? 'video/mp4' : 'application/pdf',
        resubmissionCount: overrides.resubmissionCount ?? 0,
      },
    })
  }

  async function seedAllDocuments(applicationId: string) {
    for (const type of REQUIRED_DOCUMENTS) await seedConfirmedDocument(applicationId, type)
  }

  // --- T1 ---

  it('T1 — crée un brouillon sans changer le rôle', async () => {
    const user = await makeLearner()
    const application = await createApplication(user.id, VALID_APPLICATION)

    expect(application.status).toBe('DRAFT')
    expect(application.domains).toEqual(['Développement'])
    expect((await prisma.user.findUnique({ where: { id: user.id } }))!.role).toBe('LEARNER')

    const log = await prisma.auditLog.findFirst({
      where: { action: 'TRAINER_APPLICATION_CREATED', targetId: application.id },
    })
    expect(log).not.toBeNull()
  })

  it('T1 — refuse une seconde candidature tant que la première vit', async () => {
    const user = await makeLearner()
    await createApplication(user.id, VALID_APPLICATION)
    await expectFailure(createApplication(user.id, VALID_APPLICATION), 'APPLICATION_ALREADY_EXISTS')
  })

  it('T1 — autorise à recommencer après un refus définitif', async () => {
    const user = await makeLearner()
    const first = await createApplication(user.id, VALID_APPLICATION)
    await prisma.trainerApplication.update({
      where: { id: first.id },
      data: { status: 'REJECTED', rejectedAt: new Date() },
    })

    const second = await createApplication(user.id, VALID_APPLICATION)
    expect(second.status).toBe('DRAFT')
    expect(second.id).not.toBe(first.id)
  })

  it('T1 — refuse un compte déjà formateur', async () => {
    const user = await makeLearner('deja@test.com')
    await prisma.trainerProfile.create({ data: { userId: user.id } })
    await prisma.user.update({ where: { id: user.id }, data: { role: 'TRAINER' } })

    await expectFailure(createApplication(user.id, VALID_APPLICATION), 'ALREADY_TRAINER')
  })

  // --- Présentation ---

  it('fige la présentation une fois le dossier soumis', async () => {
    const user = await makeLearner()
    const application = await createApplication(user.id, VALID_APPLICATION)
    await seedAllDocuments(application.id)

    await updateApplication(user.id, { slogan: 'Nouveau slogan' })
    expect((await getMyApplication(user.id))!.slogan).toBe('Nouveau slogan')

    await submitApplication(user.id)
    await expectFailure(updateApplication(user.id, { slogan: 'Trop tard' }), 'APPLICATION_NOT_EDITABLE')
  })

  // --- T2 ---

  it('T2 — refuse la soumission tant qu’une pièce manque', async () => {
    const user = await makeLearner()
    const application = await createApplication(user.id, VALID_APPLICATION)
    await seedConfirmedDocument(application.id, 'ID_CARD')
    await seedConfirmedDocument(application.id, 'DIPLOMA')

    expect(await missingDocuments(application.id)).toEqual(['VIDEO'])
    await expectFailure(submitApplication(user.id), 'DOCUMENTS_INCOMPLETE')
    expect((await prisma.user.findUnique({ where: { id: user.id } }))!.role).toBe('LEARNER')
  })

  it('T2 — bascule LEARNER vers PENDING_TRAINER sans déconnecter le candidat', async () => {
    const user = await makeLearner()
    const application = await createApplication(user.id, VALID_APPLICATION)
    await seedAllDocuments(application.id)
    const before = (await prisma.user.findUnique({ where: { id: user.id } }))!.sessionsValidAfter

    const submitted = await submitApplication(user.id)
    expect(submitted!.status).toBe('SUBMITTED')
    expect(submitted!.submittedAt).not.toBeNull()

    const after = await prisma.user.findUnique({ where: { id: user.id } })
    expect(after!.role).toBe('PENDING_TRAINER')
    // Le rôle est relu en base à chaque requête : inutile d'invalider les
    // sessions, ce qui éjecterait le candidat au moment de l'envoi.
    expect(after!.sessionsValidAfter.getTime()).toBe(before.getTime())

    const event = await prisma.trainerApplicationReviewEvent.findFirst({
      where: { applicationId: application.id },
    })
    expect(event).toMatchObject({ fromStatus: 'DRAFT', toStatus: 'SUBMITTED' })
  })

  it('T2 — prévient les administrateurs de modération, et eux seuls', async () => {
    const moderator = await prisma.user.create({
      data: { email: 'moderation@test.com', role: 'ADMIN', adminRole: 'MODERATION' },
    })
    const finance = await prisma.user.create({
      data: { email: 'finances@test.com', role: 'ADMIN', adminRole: 'FINANCES' },
    })
    const user = await makeLearner()
    const application = await createApplication(user.id, VALID_APPLICATION)
    await seedAllDocuments(application.id)

    await submitApplication(user.id)

    expect(await prisma.notification.count({ where: { userId: moderator.id } })).toBe(1)
    expect(await prisma.notification.count({ where: { userId: finance.id } })).toBe(0)
  })

  it('T2 — refuse une seconde soumission du même dossier', async () => {
    const user = await makeLearner()
    const application = await createApplication(user.id, VALID_APPLICATION)
    await seedAllDocuments(application.id)

    await submitApplication(user.id)
    await expectFailure(submitApplication(user.id), 'APPLICATION_NOT_SUBMITTABLE')
  })

  // --- T5 et D4 ---

  it('T5 — la re-soumission ne rétrograde pas le rôle et efface la revue précédente', async () => {
    const user = await makeLearner()
    const application = await createApplication(user.id, VALID_APPLICATION)
    await seedAllDocuments(application.id)
    await submitApplication(user.id)

    // L'admin refuse une pièce : le dossier repart chez le candidat.
    await prisma.trainerApplication.update({
      where: { id: application.id },
      data: { status: 'RESUBMISSION_PENDING', reviewedAt: new Date() },
    })
    await prisma.trainerDocument.updateMany({
      where: { applicationId: application.id, type: 'DIPLOMA' },
      data: { status: 'REJECTED', rejectionReason: 'Illisible' },
    })

    // Le candidat renvoie la pièce : nouvelle ligne courante, confirmée.
    await prisma.trainerDocument.updateMany({
      where: { applicationId: application.id, type: 'DIPLOMA' },
      data: { isCurrent: false },
    })
    await seedConfirmedDocument(application.id, 'DIPLOMA', { status: 'RESUBMITTED', resubmissionCount: 1 })

    const resubmitted = await submitApplication(user.id)
    expect(resubmitted!.status).toBe('SUBMITTED')
    expect(resubmitted!.reviewedAt).toBeNull()
    expect((await prisma.user.findUnique({ where: { id: user.id } }))!.role).toBe('PENDING_TRAINER')

    const events = await prisma.trainerApplicationReviewEvent.findMany({
      where: { applicationId: application.id },
      orderBy: { createdAt: 'asc' },
    })
    expect(events.at(-1)).toMatchObject({ fromStatus: 'RESUBMISSION_PENDING', toStatus: 'SUBMITTED' })
  })

  it('D0/D4 — le renvoi d’une pièce archive la précédente de façon atomique', async () => {
    const user = await makeLearner()
    const application = await createApplication(user.id, VALID_APPLICATION)
    const first = await seedConfirmedDocument(application.id, 'ID_CARD', { status: 'REJECTED' })
    await prisma.trainerApplication.update({
      where: { id: application.id },
      data: { status: 'RESUBMISSION_PENDING' },
    })

    const ticket = await requestDocumentUpload(user.id, {
      type: 'ID_CARD', mimeType: 'application/pdf', sizeBytes: 2048, originalFileName: 'pi.pdf',
    })

    expect((await prisma.trainerDocument.findUnique({ where: { id: first.id } }))!.isCurrent).toBe(false)
    const replacement = await prisma.trainerDocument.findUnique({ where: { id: ticket.documentId } })
    expect(replacement).toMatchObject({ isCurrent: true, status: 'AWAITING_UPLOAD', resubmissionCount: 1 })
    expect(replacement!.s3Key).toContain('ID_CARD-v1-')

    // Une seule pièce courante par type, quoi qu'il arrive.
    expect(
      await prisma.trainerDocument.count({
        where: { applicationId: application.id, type: 'ID_CARD', isCurrent: true },
      }),
    ).toBe(1)
  })

  it('D4 — bloque au-delà du nombre de renvois autorisés', async () => {
    const user = await makeLearner()
    const application = await createApplication(user.id, VALID_APPLICATION)
    await seedConfirmedDocument(application.id, 'ID_CARD', {
      status: 'REJECTED',
      resubmissionCount: MAX_RESUBMISSIONS,
    })
    await prisma.trainerApplication.update({
      where: { id: application.id },
      data: { status: 'RESUBMISSION_PENDING' },
    })

    await expectFailure(
      requestDocumentUpload(user.id, { type: 'ID_CARD', mimeType: 'application/pdf', sizeBytes: 2048 }),
      'MAX_RESUBMISSIONS_REACHED',
    )
  })

  it('D0 — refuse un type de fichier ou une taille hors limites', async () => {
    const user = await makeLearner()
    await createApplication(user.id, VALID_APPLICATION)

    await expectFailure(
      requestDocumentUpload(user.id, { type: 'ID_CARD', mimeType: 'image/gif', sizeBytes: 1024 }),
      'MIME_NOT_ALLOWED',
    )
    await expectFailure(
      requestDocumentUpload(user.id, { type: 'ID_CARD', mimeType: 'application/pdf', sizeBytes: 20_000_000 }),
      'SIZE_EXCEEDS_LIMIT',
    )
    // La vidéo a une limite bien plus haute, et n'accepte que le MP4.
    await expectFailure(
      requestDocumentUpload(user.id, { type: 'VIDEO', mimeType: 'application/pdf', sizeBytes: 1024 }),
      'MIME_NOT_ALLOWED',
    )
  })

  it('D0 — refuse tout dépôt une fois le dossier soumis', async () => {
    const user = await makeLearner()
    const application = await createApplication(user.id, VALID_APPLICATION)
    await seedAllDocuments(application.id)
    await submitApplication(user.id)

    await expectFailure(
      requestDocumentUpload(user.id, { type: 'ID_CARD', mimeType: 'application/pdf', sizeBytes: 1024 }),
      'APPLICATION_NOT_EDITABLE',
    )
  })

  it('D1 — refuse de confirmer une pièce dont le fichier est absent', async () => {
    const user = await makeLearner()
    await createApplication(user.id, VALID_APPLICATION)
    const ticket = await requestDocumentUpload(user.id, {
      type: 'ID_CARD', mimeType: 'application/pdf', sizeBytes: 2048,
    })

    // Sans stockage objet branché, aucun fichier n'a pu être déposé : la
    // confirmation doit échouer plutôt que valider une pièce inexistante.
    await expectFailure(confirmDocumentUpload(user.id, ticket.documentId), 'UPLOAD_NOT_FOUND')
    expect(
      (await prisma.trainerDocument.findUnique({ where: { id: ticket.documentId } }))!.status,
    ).toBe('AWAITING_UPLOAD')
  })

  it('D1 — refuse de confirmer la pièce d’un autre candidat', async () => {
    const owner = await makeLearner('proprietaire@test.com')
    const intruder = await makeLearner('intrus@test.com')
    const application = await createApplication(owner.id, VALID_APPLICATION)
    const ticket = await requestDocumentUpload(owner.id, {
      type: 'ID_CARD', mimeType: 'application/pdf', sizeBytes: 2048,
    })
    expect(application.id).toBeTruthy()

    await expectFailure(confirmDocumentUpload(intruder.id, ticket.documentId), 'NOT_OWNER')
  })
})
