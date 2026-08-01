// ==========================================================================
// Lot 1 — Revue des candidatures (T3, T4, T6/T7, T8, D2/D3)
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { TrainerDocumentType } from '@prisma/client'
import { prisma, cleanDatabase } from './setup'
import {
  createApplication,
  submitApplication,
  missingDocuments,
  REQUIRED_DOCUMENTS,
  MAX_RESUBMISSIONS,
} from '@/lib/trainer-applications'
import {
  approveApplication,
  rejectDocuments,
  rejectApplicationFinal,
  reopenApplication,
  listApplications,
  getApplicationStats,
  getApplicationDetail,
} from '@/lib/trainer-application-review'

const APPLICATION = {
  slogan: 'Le back-end sans mystère',
  description: "J'accompagne les équipes africaines vers des architectures qui tiennent la charge.",
  domains: ['Développement'],
  experienceYears: 12,
}

const HOUR = 3_600_000

async function expectFailure(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toThrow(code)
}

describe('Lot 1 — Revue des candidatures', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function makeAdmin(adminRole: 'MODERATION' | 'SUPER_ADMIN' = 'MODERATION') {
    return prisma.user.create({
      data: { email: `${adminRole.toLowerCase()}-${crypto.randomUUID()}@test.com`, role: 'ADMIN', adminRole },
    })
  }

  async function seedDocument(applicationId: string, type: TrainerDocumentType, resubmissionCount = 0) {
    return prisma.trainerDocument.create({
      data: {
        applicationId, type, status: resubmissionCount > 0 ? 'RESUBMITTED' : 'PENDING', isCurrent: true,
        s3Key: `trainer-documents/${applicationId}/${type}-v${resubmissionCount}-x.pdf`,
        sha256: 'sha256:factice', sizeBytes: 2048,
        mimeType: type === 'VIDEO' ? 'video/mp4' : 'application/pdf',
        resubmissionCount,
      },
    })
  }

  /** Un dossier soumis, prêt à être examiné. */
  async function submittedApplication(email = 'candidat@test.com') {
    const user = await prisma.user.create({ data: { email, fullName: 'Kwame Mensah', role: 'LEARNER' } })
    const application = await createApplication(user.id, APPLICATION)
    for (const type of REQUIRED_DOCUMENTS) await seedDocument(application.id, type)
    await submitApplication(user.id)
    const fresh = (await prisma.trainerApplication.findUnique({ where: { id: application.id } }))!
    return { user, application: fresh }
  }

  // --- T3 ---

  it('T3 — crée le profil formateur, le portefeuille, et bascule le rôle', async () => {
    const admin = await makeAdmin()
    const { user, application } = await submittedApplication()
    const before = (await prisma.user.findUnique({ where: { id: user.id } }))!.sessionsValidAfter

    const { trainerId } = await approveApplication(application.id, admin.id, {
      expectedUpdatedAt: application.updatedAt.toISOString(),
      verifiedLegalName: 'Kwame Mensah',
    })

    const profile = await prisma.trainerProfile.findUnique({ where: { id: trainerId } })
    expect(profile).toMatchObject({
      userId: user.id,
      verifiedLegalName: 'Kwame Mensah',
      slogan: APPLICATION.slogan,
    })
    expect(profile!.approvedAt).not.toBeNull()

    const wallet = await prisma.wallet.findUnique({ where: { trainerId } })
    expect(wallet).toMatchObject({ balance: 0 })

    const after = await prisma.user.findUnique({ where: { id: user.id } })
    expect(after!.role).toBe('TRAINER')
    // Admettre un formateur ne doit pas le déconnecter.
    expect(after!.sessionsValidAfter.getTime()).toBe(before.getTime())

    // D2 : les pièces suivent la décision du dossier.
    const documents = await prisma.trainerDocument.findMany({ where: { applicationId: application.id } })
    expect(documents.every((d) => d.status === 'APPROVED')).toBe(true)
  })

  it('T3 — refuse une décision prise sur une version périmée du dossier', async () => {
    const admin = await makeAdmin()
    const { application } = await submittedApplication()
    const stale = new Date(application.updatedAt.getTime() - 60_000).toISOString()

    await expectFailure(
      approveApplication(application.id, admin.id, {
        expectedUpdatedAt: stale,
        verifiedLegalName: 'Kwame Mensah',
      }),
      'STALE_APPLICATION',
    )
    expect(
      (await prisma.trainerApplication.findUnique({ where: { id: application.id } }))!.status,
    ).toBe('SUBMITTED')
  })

  it('T3 — refuse un dossier qui n’est pas soumis', async () => {
    const admin = await makeAdmin()
    const user = await prisma.user.create({ data: { email: 'brouillon@test.com' } })
    const draft = await createApplication(user.id, APPLICATION)
    const fresh = (await prisma.trainerApplication.findUnique({ where: { id: draft.id } }))!

    await expectFailure(
      approveApplication(draft.id, admin.id, {
        expectedUpdatedAt: fresh.updatedAt.toISOString(),
        verifiedLegalName: 'Kwame Mensah',
      }),
      'APPLICATION_NOT_REVIEWABLE',
    )
  })

  it('T3 — exige un nom légal vérifié', async () => {
    const admin = await makeAdmin()
    const { application } = await submittedApplication()

    await expectFailure(
      approveApplication(application.id, admin.id, {
        expectedUpdatedAt: application.updatedAt.toISOString(),
        verifiedLegalName: ' ',
      }),
      'LEGAL_NAME_REQUIRED',
    )
  })

  // --- T4 ---

  it('T4 — renvoie le dossier au candidat et conserve les pièces non contestées', async () => {
    const admin = await makeAdmin()
    const { user, application } = await submittedApplication()
    const diploma = (await prisma.trainerDocument.findFirst({
      where: { applicationId: application.id, type: 'DIPLOMA' },
    }))!

    await rejectDocuments(application.id, admin.id, {
      expectedUpdatedAt: application.updatedAt.toISOString(),
      rejections: [{ documentId: diploma.id, reason: 'Document illisible, merci de renvoyer un scan net.' }],
    })

    const after = await prisma.trainerApplication.findUnique({ where: { id: application.id } })
    expect(after!.status).toBe('RESUBMISSION_PENDING')
    expect(after!.reviewedAt).not.toBeNull()

    const documents = await prisma.trainerDocument.findMany({ where: { applicationId: application.id } })
    expect(documents.find((d) => d.type === 'DIPLOMA')).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Document illisible, merci de renvoyer un scan net.',
    })
    // Les deux autres sont acquises.
    expect(documents.filter((d) => d.status === 'APPROVED')).toHaveLength(2)

    // Le candidat reste formateur en attente, et n'a plus qu'une pièce à fournir.
    expect((await prisma.user.findUnique({ where: { id: user.id } }))!.role).toBe('PENDING_TRAINER')
    expect(await missingDocuments(application.id)).toEqual(['DIPLOMA'])
  })

  it('T4 — une pièce validée ne bloque plus la re-soumission', async () => {
    const admin = await makeAdmin()
    const { user, application } = await submittedApplication()
    const idCard = (await prisma.trainerDocument.findFirst({
      where: { applicationId: application.id, type: 'ID_CARD' },
    }))!

    await rejectDocuments(application.id, admin.id, {
      expectedUpdatedAt: application.updatedAt.toISOString(),
      rejections: [{ documentId: idCard.id, reason: 'Pièce expirée, merci d’en fournir une valide.' }],
    })

    // Le candidat renvoie la seule pièce refusée.
    await prisma.trainerDocument.update({ where: { id: idCard.id }, data: { isCurrent: false } })
    await seedDocument(application.id, 'ID_CARD', 1)

    expect(await missingDocuments(application.id)).toEqual([])
    const resubmitted = await submitApplication(user.id)
    expect(resubmitted!.status).toBe('SUBMITTED')
  })

  it('T4 — exige au moins une pièce et un motif exploitable', async () => {
    const admin = await makeAdmin()
    const { application } = await submittedApplication()

    await expectFailure(
      rejectDocuments(application.id, admin.id, {
        expectedUpdatedAt: application.updatedAt.toISOString(),
        rejections: [],
      }),
      'NO_DOCUMENT_REJECTED',
    )
  })

  it('T4 — refuse de renvoyer une pièce ayant épuisé ses renvois', async () => {
    const admin = await makeAdmin()
    const user = await prisma.user.create({ data: { email: 'epuise@test.com' } })
    const application = await createApplication(user.id, APPLICATION)
    for (const type of REQUIRED_DOCUMENTS) {
      await seedDocument(application.id, type, type === 'DIPLOMA' ? MAX_RESUBMISSIONS : 0)
    }
    await submitApplication(user.id)
    const fresh = (await prisma.trainerApplication.findUnique({ where: { id: application.id } }))!
    const diploma = (await prisma.trainerDocument.findFirst({
      where: { applicationId: application.id, type: 'DIPLOMA' },
    }))!

    await expectFailure(
      rejectDocuments(application.id, admin.id, {
        expectedUpdatedAt: fresh.updatedAt.toISOString(),
        rejections: [{ documentId: diploma.id, reason: 'Toujours illisible après plusieurs renvois.' }],
      }),
      'MAX_RESUBMISSIONS_REACHED',
    )
  })

  // --- T6 / T7 ---

  it('T6 — le refus définitif ramène le candidat au rôle d’apprenant', async () => {
    const admin = await makeAdmin()
    const { user, application } = await submittedApplication()

    await rejectApplicationFinal(application.id, admin.id, {
      expectedUpdatedAt: application.updatedAt.toISOString(),
      reason: 'Le domaine proposé ne correspond pas au catalogue NkamVa.',
    })

    const after = await prisma.trainerApplication.findUnique({ where: { id: application.id } })
    expect(after!.status).toBe('REJECTED')
    expect(after!.rejectedAt).not.toBeNull()
    expect(after!.finalRejectionReason).toContain('ne correspond pas')

    expect((await prisma.user.findUnique({ where: { id: user.id } }))!.role).toBe('LEARNER')
    expect(await prisma.trainerProfile.count({ where: { userId: user.id } })).toBe(0)
  })

  it('T6 — exige un motif circonstancié', async () => {
    const admin = await makeAdmin()
    const { application } = await submittedApplication()

    await expectFailure(
      rejectApplicationFinal(application.id, admin.id, {
        expectedUpdatedAt: application.updatedAt.toISOString(),
        reason: 'non',
      }),
      'REJECTION_REASON_REQUIRED',
    )
  })

  // --- T8 ---

  async function rejectedApplication(hoursAgo: number) {
    const admin = await makeAdmin()
    const { user, application } = await submittedApplication()
    await rejectApplicationFinal(application.id, admin.id, {
      expectedUpdatedAt: application.updatedAt.toISOString(),
      reason: 'Dossier incomplet malgré les relances effectuées.',
    })
    await prisma.trainerApplication.update({
      where: { id: application.id },
      data: { rejectedAt: new Date(Date.now() - hoursAgo * HOUR) },
    })
    return { user, applicationId: application.id }
  }

  it('T8 — un super-administrateur rouvre un dossier refusé depuis plus de 24 h', async () => {
    const superAdmin = await makeAdmin('SUPER_ADMIN')
    const { user, applicationId } = await rejectedApplication(30)

    await reopenApplication(applicationId, superAdmin.id)

    const after = await prisma.trainerApplication.findUnique({ where: { id: applicationId } })
    expect(after!.status).toBe('RESUBMISSION_PENDING')
    expect(after!.reopenedById).toBe(superAdmin.id)
    expect(after!.rejectedAt).toBeNull()
    expect(after!.finalRejectionReason).toBeNull()
    expect((await prisma.user.findUnique({ where: { id: user.id } }))!.role).toBe('PENDING_TRAINER')
  })

  it('T8 — refuse une réouverture dans les 24 h suivant le refus', async () => {
    const superAdmin = await makeAdmin('SUPER_ADMIN')
    const { applicationId } = await rejectedApplication(5)

    await expectFailure(reopenApplication(applicationId, superAdmin.id), 'REOPEN_TOO_EARLY')
  })

  it('T8 — ne rouvre qu’une seule fois', async () => {
    const superAdmin = await makeAdmin('SUPER_ADMIN')
    const { applicationId } = await rejectedApplication(30)

    await reopenApplication(applicationId, superAdmin.id)
    // Remise en refus pour tenter une seconde réouverture.
    await prisma.trainerApplication.update({
      where: { id: applicationId },
      data: { status: 'REJECTED', rejectedAt: new Date(Date.now() - 30 * HOUR) },
    })

    await expectFailure(reopenApplication(applicationId, superAdmin.id), 'ALREADY_REOPENED')
  })

  it('T8 — refuse de rouvrir un dossier dont les pièces sont purgées', async () => {
    const superAdmin = await makeAdmin('SUPER_ADMIN')
    const { applicationId } = await rejectedApplication(30)
    await prisma.trainerDocument.updateMany({
      where: { applicationId },
      data: { purgedAt: new Date(), s3Key: '' },
    })

    await expectFailure(reopenApplication(applicationId, superAdmin.id), 'DOCUMENTS_PURGED')
  })

  it('T8 — refuse de rouvrir un dossier qui n’a pas été refusé', async () => {
    const superAdmin = await makeAdmin('SUPER_ADMIN')
    const { application } = await submittedApplication()

    await expectFailure(reopenApplication(application.id, superAdmin.id), 'APPLICATION_NOT_REJECTED')
  })

  // --- Listing ---

  it('liste les dossiers du plus ancien au plus récent et compte par statut', async () => {
    const admin = await makeAdmin()
    const first = await submittedApplication('un@test.com')
    const second = await submittedApplication('deux@test.com')
    await rejectApplicationFinal(second.application.id, admin.id, {
      expectedUpdatedAt: second.application.updatedAt.toISOString(),
      reason: 'Dossier hors périmètre pour le moment.',
    })

    const submitted = await listApplications({ status: 'SUBMITTED', page: 1, pageSize: 20 })
    expect(submitted.total).toBe(1)
    expect(submitted.items[0].id).toBe(first.application.id)
    expect(submitted.items[0].user.email).toBe('un@test.com')

    const stats = await getApplicationStats()
    expect(stats).toMatchObject({ submitted: 1, rejected: 1, approved: 0 })
  })

  it('le détail expose les pièces courantes et l’historique des décisions', async () => {
    const admin = await makeAdmin()
    const { application } = await submittedApplication()
    const video = (await prisma.trainerDocument.findFirst({
      where: { applicationId: application.id, type: 'VIDEO' },
    }))!

    await rejectDocuments(application.id, admin.id, {
      expectedUpdatedAt: application.updatedAt.toISOString(),
      rejections: [{ documentId: video.id, reason: 'La vidéo ne montre pas votre visage.' }],
    })

    const detail = await getApplicationDetail(application.id)
    expect(detail!.documents).toHaveLength(3)
    expect(detail!.reviewEvents.map((e) => e.toStatus)).toEqual(['SUBMITTED', 'RESUBMISSION_PENDING'])
    expect(detail!.reviewEvents.at(-1)!.rejectedDocIds).toEqual([video.id])
  })
})
