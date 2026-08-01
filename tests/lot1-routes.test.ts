// ==========================================================================
// Lot 1 — Routes HTTP : RBAC, validation, concurrence
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prisma, cleanDatabase } from './setup'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
import { getServerSession } from 'next-auth'

import { createApplication, submitApplication, rejectApplicationFinal } from '@/lib/trainer-applications'
import { requestDocumentUpload, confirmDocumentUpload, REQUIRED_DOCUMENT_TYPES } from '@/lib/trainer-documents'

import { POST as createRoute } from '@/app/api/trainer-applications/route'
import { GET as myApplicationRoute } from '@/app/api/trainer-applications/me/route'
import { POST as submitRoute } from '@/app/api/trainer-applications/me/submit/route'
import { GET as adminListRoute } from '@/app/api/admin/trainer-applications/route'
import { GET as adminStatsRoute } from '@/app/api/admin/trainer-applications/stats/route'
import { POST as approveRoute } from '@/app/api/admin/trainer-applications/[applicationId]/approve/route'
import { POST as reopenRoute } from '@/app/api/admin/trainer-applications/[applicationId]/reopen/route'
import { GET as documentViewRoute } from '@/app/api/admin/trainer-applications/[applicationId]/documents/[documentId]/route'

const SHA = 'b'.repeat(64)
const MIME_BY_TYPE = { ID_CARD: 'application/pdf', DIPLOMA: 'application/pdf', VIDEO: 'video/mp4' } as const

type SessionUser = {
  id: string
  role: 'LEARNER' | 'PENDING_TRAINER' | 'TRAINER' | 'ADMIN'
  adminRole?: 'SUPER_ADMIN' | 'FINANCES' | 'MODERATION' | null
  trainerId?: string | null
}

function signInAs(user: SessionUser | null) {
  vi.mocked(getServerSession).mockResolvedValue(
    user ? ({ user: { email: 'x@test.com', adminRole: null, trainerId: null, ...user } } as never) : null,
  )
}

function jsonRequest(body: unknown) {
  return new Request('http://localhost/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('Lot 1 — Routes', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase(); vi.clearAllMocks() })

  async function setupActors() {
    const candidate = await prisma.user.create({ data: { email: 'candidat@test.com', role: 'LEARNER' } })
    const moderator = await prisma.user.create({
      data: { email: 'moderation@test.com', role: 'ADMIN', adminRole: 'MODERATION' },
    })
    const finance = await prisma.user.create({
      data: { email: 'finances@test.com', role: 'ADMIN', adminRole: 'FINANCES' },
    })
    const superAdmin = await prisma.user.create({
      data: { email: 'super@test.com', role: 'ADMIN', adminRole: 'SUPER_ADMIN' },
    })
    return { candidate, moderator, finance, superAdmin }
  }

  async function submittedApplication(userId: string) {
    const application = await createApplication(userId, { slogan: 'Slogan' })
    for (const type of REQUIRED_DOCUMENT_TYPES) {
      const { documentId } = await requestDocumentUpload(userId, {
        type, mimeType: MIME_BY_TYPE[type], sizeBytes: 1024, sha256: SHA,
      })
      await confirmDocumentUpload(userId, documentId)
    }
    await submitApplication(userId)
    return application
  }

  // -------------------------------------------------------------------------
  it('POST /api/trainer-applications — 401 sans session, 201 puis 409', async () => {
    const { candidate } = await setupActors()

    signInAs(null)
    expect((await createRoute(jsonRequest({}))).status).toBe(401)

    signInAs({ id: candidate.id, role: 'LEARNER' })
    const created = await createRoute(jsonRequest({ slogan: 'Apprenez le code', experienceYears: 5 }))
    expect(created.status).toBe(201)
    expect((await created.json()).data.status).toBe('DRAFT')

    const duplicate = await createRoute(jsonRequest({}))
    expect(duplicate.status).toBe(409)
    expect((await duplicate.json()).error.code).toBe('APPLICATION_ALREADY_EXISTS')
  })

  // -------------------------------------------------------------------------
  it('GET /api/trainer-applications/me — 404 puis 200, et POST submit refuse un dossier incomplet', async () => {
    const { candidate } = await setupActors()
    signInAs({ id: candidate.id, role: 'LEARNER' })

    expect((await myApplicationRoute()).status).toBe(404)

    await createRoute(jsonRequest({}))
    const mine = await myApplicationRoute()
    expect(mine.status).toBe(200)
    expect((await mine.json()).data.documents).toEqual([])

    const incomplete = await submitRoute()
    expect(incomplete.status).toBe(422)
    expect((await incomplete.json()).error.code).toBe('DOCUMENTS_INCOMPLETE')
  })

  // -------------------------------------------------------------------------
  // Décision 7 — Finances n'a AUCUN accès à la modération, donc aucun accès aux
  // pièces d'identité des candidats.
  it('décision 7 — Finances est exclue de toute la validation formateur', async () => {
    const { candidate, moderator, finance } = await setupActors()
    const application = await submittedApplication(candidate.id)
    const doc = await prisma.trainerDocument.findFirstOrThrow({
      where: { applicationId: application.id, type: 'ID_CARD', isCurrent: true },
    })

    signInAs({ id: finance.id, role: 'ADMIN', adminRole: 'FINANCES' })
    for (const [label, res] of [
      ['liste', await adminListRoute(new Request('http://localhost/api/admin/trainer-applications'))],
      ['stats', await adminStatsRoute()],
      ['pièce', await documentViewRoute(new Request('http://localhost/x'), {
        params: Promise.resolve({ applicationId: application.id, documentId: doc.id }),
      })],
    ] as const) {
      expect(res.status, `Finances ne doit pas accéder à : ${label}`).toBe(403)
    }

    // Aucune consultation de pièce n'a été journalisée au nom de Finances
    const views = await prisma.auditLog.count({
      where: { action: 'TRAINER_DOCUMENT_VIEW', actorId: finance.id },
    })
    expect(views).toBe(0)

    // La Modération, elle, accède bien à la file
    signInAs({ id: moderator.id, role: 'ADMIN', adminRole: 'MODERATION' })
    expect((await adminListRoute(new Request('http://localhost/api/admin/trainer-applications'))).status).toBe(200)
    expect((await adminStatsRoute()).status).toBe(200)
  })

  // -------------------------------------------------------------------------
  it('GET document — la Modération obtient une redirection 302 et la consultation est journalisée', async () => {
    const { candidate, moderator } = await setupActors()
    const application = await submittedApplication(candidate.id)
    const doc = await prisma.trainerDocument.findFirstOrThrow({
      where: { applicationId: application.id, type: 'ID_CARD', isCurrent: true },
    })

    signInAs({ id: moderator.id, role: 'ADMIN', adminRole: 'MODERATION' })
    const res = await documentViewRoute(new Request('http://localhost/x'), {
      params: Promise.resolve({ applicationId: application.id, documentId: doc.id }),
    })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBeTruthy()

    const views = await prisma.auditLog.count({
      where: { action: 'TRAINER_DOCUMENT_VIEW', targetId: doc.id, actorId: moderator.id },
    })
    expect(views).toBe(1)
  })

  // -------------------------------------------------------------------------
  it('POST /approve — 409 si expectedUpdatedAt est périmé, 200 sinon', async () => {
    const { candidate, moderator } = await setupActors()
    const application = await submittedApplication(candidate.id)

    signInAs({ id: moderator.id, role: 'ADMIN', adminRole: 'MODERATION' })
    const stale = await approveRoute(
      jsonRequest({ verifiedLegalName: 'Jean Candidat', expectedUpdatedAt: new Date(0).toISOString() }),
      { params: Promise.resolve({ applicationId: application.id }) },
    )
    expect(stale.status).toBe(409)
    expect((await stale.json()).error.code).toBe('STALE_APPLICATION')
    expect(await prisma.trainerProfile.count()).toBe(0)

    const fresh = await prisma.trainerApplication.findUniqueOrThrow({ where: { id: application.id } })
    const ok = await approveRoute(
      jsonRequest({ verifiedLegalName: 'Jean Candidat', expectedUpdatedAt: fresh.updatedAt.toISOString() }),
      { params: Promise.resolve({ applicationId: application.id }) },
    )
    expect(ok.status).toBe(200)
    expect(await prisma.trainerProfile.count()).toBe(1)
    expect(await prisma.wallet.count()).toBe(1)
  })

  // -------------------------------------------------------------------------
  it('POST /reopen — réservé au Super-admin, refusé à la Modération', async () => {
    const { candidate, moderator, superAdmin } = await setupActors()
    const application = await submittedApplication(candidate.id)

    const fresh = await prisma.trainerApplication.findUniqueOrThrow({ where: { id: application.id } })
    await rejectApplicationFinal(application.id, {
      reason: 'Dossier non conforme après instruction.',
      expectedUpdatedAt: fresh.updatedAt.toISOString(),
      actorId: moderator.id,
    })
    await prisma.trainerApplication.update({
      where: { id: application.id },
      data: { rejectedAt: new Date(Date.now() - 25 * 3600_000) },
    })

    signInAs({ id: moderator.id, role: 'ADMIN', adminRole: 'MODERATION' })
    const forbidden = await reopenRoute(new Request('http://localhost/x', { method: 'POST' }), {
      params: Promise.resolve({ applicationId: application.id }),
    })
    expect(forbidden.status).toBe(403)
    expect((await forbidden.json()).error.code).toBe('FORBIDDEN_SUBROLE')

    signInAs({ id: superAdmin.id, role: 'ADMIN', adminRole: 'SUPER_ADMIN' })
    const ok = await reopenRoute(new Request('http://localhost/x', { method: 'POST' }), {
      params: Promise.resolve({ applicationId: application.id }),
    })
    expect(ok.status).toBe(200)

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: candidate.id } })
    expect(refreshed.role).toBe('PENDING_TRAINER')
  })
})
