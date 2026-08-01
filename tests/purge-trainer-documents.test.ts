// ==========================================================================
// Job de purge des pièces justificatives (D7)
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { TrainerApplicationStatus, TrainerDocumentType } from '@prisma/client'
import { prisma, cleanDatabase } from './setup'
import { purgeTrainerDocuments } from '@/lib/jobs/purge-trainer-documents'
import { DOCUMENT_RETENTION_DAYS } from '@/lib/trainer-applications'

const DAY = 86_400_000

/** Stockage simulé : retient les clés supprimées, et peut échouer à la demande. */
function fakeStorage(options: { failOn?: (key: string) => boolean } = {}) {
  const deleted: string[] = []
  return {
    deleted,
    remove: async (key: string) => {
      if (options.failOn?.(key)) return false
      deleted.push(key)
      return true
    },
  }
}

describe('Job — purge des pièces justificatives', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function makeApplication(opts: {
    status: TrainerApplicationStatus
    decidedDaysAgo?: number
    email?: string
  }) {
    const user = await prisma.user.create({
      data: { email: opts.email ?? `c-${crypto.randomUUID()}@test.com` },
    })
    const decidedAt =
      opts.decidedDaysAgo == null ? null : new Date(Date.now() - opts.decidedDaysAgo * DAY)
    return prisma.trainerApplication.create({
      data: {
        userId: user.id,
        status: opts.status,
        submittedAt: new Date(Date.now() - 200 * DAY),
        ...(opts.status === 'APPROVED' ? { approvedAt: decidedAt } : {}),
        ...(opts.status === 'REJECTED' ? { rejectedAt: decidedAt } : {}),
      },
    })
  }

  async function makeDocument(
    applicationId: string,
    type: TrainerDocumentType,
    overrides: { isCurrent?: boolean; resubmissionCount?: number } = {},
  ) {
    return prisma.trainerDocument.create({
      data: {
        applicationId,
        type,
        status: 'APPROVED',
        isCurrent: overrides.isCurrent ?? true,
        resubmissionCount: overrides.resubmissionCount ?? 0,
        s3Key: `trainer-documents/${applicationId}/${type}-v${overrides.resubmissionCount ?? 0}-${crypto.randomUUID()}.pdf`,
        sha256: 'sha256:factice',
        sizeBytes: 2048,
        mimeType: 'application/pdf',
        originalFileName: 'kwame-mensah-piece-identite.pdf',
      },
    })
  }

  it('efface les pièces d’un dossier tranché depuis plus de 90 jours', async () => {
    const application = await makeApplication({
      status: 'APPROVED',
      decidedDaysAgo: DOCUMENT_RETENTION_DAYS + 1,
    })
    const document = await makeDocument(application.id, 'ID_CARD')
    const storage = fakeStorage()

    const result = await purgeTrainerDocuments(new Date(), storage.remove)
    expect(result).toMatchObject({ eligible: 1, purged: 1, failed: 0 })

    // Le fichier a bien été retiré du stockage, avec la bonne clé.
    expect(storage.deleted).toEqual([document.s3Key])

    const after = await prisma.trainerDocument.findUnique({ where: { id: document.id } })
    expect(after!.purgedAt).not.toBeNull()
    expect(after!.s3Key).toBe('')
    expect(after!.sha256).toBe('')
    expect(after!.originalFileName).toBeNull()
    // La ligne survit : le type et l'état documentent la décision passée.
    expect(after!.type).toBe('ID_CARD')
    expect(after!.status).toBe('APPROVED')

    const log = await prisma.auditLog.findFirst({
      where: { action: 'TRAINER_DOCUMENT_PURGED', targetId: document.id },
    })
    expect(log).not.toBeNull()
  })

  it('efface aussi les versions archivées par une re-soumission', async () => {
    const application = await makeApplication({
      status: 'REJECTED',
      decidedDaysAgo: DOCUMENT_RETENTION_DAYS + 5,
    })
    await makeDocument(application.id, 'DIPLOMA', { isCurrent: false, resubmissionCount: 0 })
    await makeDocument(application.id, 'DIPLOMA', { isCurrent: true, resubmissionCount: 1 })
    const storage = fakeStorage()

    const result = await purgeTrainerDocuments(new Date(), storage.remove)
    // Une pièce remplacée porte les mêmes données personnelles que sa remplaçante.
    expect(result).toMatchObject({ eligible: 2, purged: 2 })
    expect(storage.deleted).toHaveLength(2)
    expect(await prisma.trainerDocument.count({ where: { purgedAt: null } })).toBe(0)
  })

  it('épargne un dossier tranché il y a moins de 90 jours', async () => {
    const application = await makeApplication({
      status: 'APPROVED',
      decidedDaysAgo: DOCUMENT_RETENTION_DAYS - 1,
    })
    const document = await makeDocument(application.id, 'ID_CARD')
    const storage = fakeStorage()

    expect(await purgeTrainerDocuments(new Date(), storage.remove)).toMatchObject({ eligible: 0 })
    expect(storage.deleted).toEqual([])
    expect((await prisma.trainerDocument.findUnique({ where: { id: document.id } }))!.s3Key).toBe(
      document.s3Key,
    )
  })

  it('épargne un dossier encore en cours d’examen, si ancien soit-il', async () => {
    const application = await makeApplication({ status: 'SUBMITTED' })
    await makeDocument(application.id, 'VIDEO')
    const storage = fakeStorage()

    // Sans décision, le délai de conservation n'a pas commencé à courir.
    expect(await purgeTrainerDocuments(new Date(), storage.remove)).toMatchObject({ eligible: 0 })
    expect(storage.deleted).toEqual([])
  })

  it('laisse la ligne intacte quand le stockage ne confirme pas la suppression', async () => {
    const application = await makeApplication({
      status: 'REJECTED',
      decidedDaysAgo: DOCUMENT_RETENTION_DAYS + 2,
    })
    const document = await makeDocument(application.id, 'ID_CARD')
    const storage = fakeStorage({ failOn: () => true })

    const result = await purgeTrainerDocuments(new Date(), storage.remove)
    expect(result).toMatchObject({ eligible: 1, purged: 0, failed: 1 })

    // La clé doit survivre : sans elle, le fichier deviendrait inatteignable.
    const after = await prisma.trainerDocument.findUnique({ where: { id: document.id } })
    expect(after!.purgedAt).toBeNull()
    expect(after!.s3Key).toBe(document.s3Key)
  })

  it('reprend au passage suivant ce qu’un échec avait laissé', async () => {
    const application = await makeApplication({
      status: 'REJECTED',
      decidedDaysAgo: DOCUMENT_RETENTION_DAYS + 2,
    })
    const document = await makeDocument(application.id, 'ID_CARD')

    await purgeTrainerDocuments(new Date(), fakeStorage({ failOn: () => true }).remove)
    const recovered = fakeStorage()
    expect(await purgeTrainerDocuments(new Date(), recovered.remove)).toMatchObject({ purged: 1 })
    expect(recovered.deleted).toEqual([document.s3Key])
    expect(
      (await prisma.trainerDocument.findUnique({ where: { id: document.id } }))!.purgedAt,
    ).not.toBeNull()
  })

  it('est idempotent : une seconde passe ne retrouve rien à faire', async () => {
    const application = await makeApplication({
      status: 'APPROVED',
      decidedDaysAgo: DOCUMENT_RETENTION_DAYS + 10,
    })
    const document = await makeDocument(application.id, 'ID_CARD')

    expect(await purgeTrainerDocuments(new Date(), fakeStorage().remove)).toMatchObject({ purged: 1 })
    const second = fakeStorage()
    expect(await purgeTrainerDocuments(new Date(), second.remove)).toMatchObject({
      eligible: 0,
      purged: 0,
    })
    expect(second.deleted).toEqual([])
    expect(
      await prisma.auditLog.count({
        where: { action: 'TRAINER_DOCUMENT_PURGED', targetId: document.id },
      }),
    ).toBe(1)
  })

  it('traite plusieurs dossiers échus et laisse les autres', async () => {
    const old = await makeApplication({
      status: 'APPROVED',
      decidedDaysAgo: DOCUMENT_RETENTION_DAYS + 1,
    })
    await makeDocument(old.id, 'ID_CARD')
    await makeDocument(old.id, 'DIPLOMA')

    const recent = await makeApplication({ status: 'REJECTED', decidedDaysAgo: 10 })
    await makeDocument(recent.id, 'ID_CARD')

    const storage = fakeStorage()
    expect(await purgeTrainerDocuments(new Date(), storage.remove)).toMatchObject({
      eligible: 2,
      purged: 2,
      failed: 0,
    })
    expect(await prisma.trainerDocument.count({ where: { purgedAt: null } })).toBe(1)
  })
})
