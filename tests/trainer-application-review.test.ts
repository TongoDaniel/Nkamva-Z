// ==========================================================================
// Lot 1 — Modèles de lecture de la console de validation
// ==========================================================================
// Ce fichier ne teste QUE les lectures de `trainer-application-review.ts`.
// L'instruction elle-même est couverte par `lot1-invariants` et `lot1-routes`,
// qui exercent `trainer-applications.ts` — le seul chemin d'écriture que les
// routes empruntent. Les décisions déclenchées ici passent donc, elles aussi,
// par ce service : un test de lecture ne doit pas fabriquer son état avec une
// implémentation que la production n'utilise pas.
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { TrainerDocumentType } from '@prisma/client'
import { prisma, cleanDatabase } from './setup'
import {
  createApplication,
  submitApplication,
  rejectDocuments,
  rejectApplicationFinal,
  REQUIRED_DOCUMENTS,
} from '@/lib/trainer-applications'
import {
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

describe('Lot 1 — Modèles de lecture de la console', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function makeAdmin(adminRole: 'MODERATION' | 'SUPER_ADMIN' = 'MODERATION') {
    return prisma.user.create({
      data: { email: `${adminRole.toLowerCase()}-${crypto.randomUUID()}@test.com`, role: 'ADMIN', adminRole },
    })
  }

  // Les pièces sont posées directement : ce fichier teste des projections de
  // lecture, pas le parcours de téléversement (couvert par `lot1-invariants`).
  async function seedDocument(applicationId: string, type: TrainerDocumentType) {
    return prisma.trainerDocument.create({
      data: {
        applicationId, type, status: 'PENDING', isCurrent: true,
        s3Key: `trainer-documents/${applicationId}/${type}-v0-x.pdf`,
        sha256: 'sha256:factice', sizeBytes: 2048,
        mimeType: type === 'VIDEO' ? 'video/mp4' : 'application/pdf',
        resubmissionCount: 0,
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

  it('liste les dossiers du plus ancien au plus récent et compte par statut', async () => {
    const admin = await makeAdmin()
    const first = await submittedApplication('un@test.com')
    const second = await submittedApplication('deux@test.com')
    await rejectApplicationFinal(second.application.id, {
      expectedUpdatedAt: second.application.updatedAt.toISOString(),
      reason: 'Dossier hors périmètre pour le moment.',
      actorId: admin.id,
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

    await rejectDocuments(application.id, {
      expectedUpdatedAt: application.updatedAt.toISOString(),
      rejections: [{ documentId: video.id, rejectionReason: 'La vidéo ne montre pas votre visage.' }],
      actorId: admin.id,
    })

    const detail = await getApplicationDetail(application.id)
    expect(detail!.documents).toHaveLength(3)
    expect(detail!.reviewEvents.map((e) => e.toStatus)).toEqual(['SUBMITTED', 'RESUBMISSION_PENDING'])
    expect(detail!.reviewEvents.at(-1)!.rejectedDocIds).toEqual([video.id])
  })
})
