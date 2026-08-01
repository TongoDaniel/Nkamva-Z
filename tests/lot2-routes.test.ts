// ==========================================================================
// Lot 2 — Routes HTTP : RBAC, validation, mapping des erreurs métier
// ==========================================================================
// Les handlers sont invoqués directement (pas de serveur) avec une session
// NextAuth simulée : `/api/auth/[...nextauth]` n'existe pas encore (Lot 0), et
// c'est la logique de `requireAuth` / `requireAdminSubRole` qu'on veut exercer,
// pas le mécanisme de cookie.
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prisma, cleanDatabase } from './setup'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
import { getServerSession } from 'next-auth'

import { createCourse, publishCourse } from '@/lib/courses'
import { initiatePurchase } from '@/lib/purchases'
import { openDispute } from '@/lib/disputes'

import { GET as listMyDisputesRoute, POST as openDisputeRoute } from '@/app/api/me/disputes/route'
import { GET as getMyDisputeRoute } from '@/app/api/me/disputes/[disputeId]/route'
import { POST as postLearnerMessageRoute } from '@/app/api/me/disputes/[disputeId]/messages/route'
import { GET as listAdminDisputesRoute } from '@/app/api/admin/disputes/route'
import { GET as adminStatsRoute } from '@/app/api/admin/disputes/stats/route'
import { POST as resolveRoute } from '@/app/api/admin/disputes/[disputeId]/resolve/route'
import { GET as listManualRefundTasksRoute } from '@/app/api/admin/manual-refund-tasks/route'
import { GET as listTrainerDisputesRoute } from '@/app/api/trainer/disputes/route'
import { POST as contestRoute } from '@/app/api/trainer/disputes/[disputeId]/contest/route'

type SessionUser = {
  id: string
  email?: string
  role: 'LEARNER' | 'TRAINER' | 'ADMIN'
  adminRole?: 'SUPER_ADMIN' | 'FINANCES' | 'MODERATION' | null
  trainerId?: string | null
}

function signInAs(user: SessionUser | null) {
  vi.mocked(getServerSession).mockResolvedValue(
    user ? ({ user: { email: 'x@test.com', adminRole: null, trainerId: null, ...user } } as never) : null,
  )
}

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('Lot 2 — Routes', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase(); vi.clearAllMocks() })

  async function setupScenario() {
    const trainerUser = await prisma.user.create({ data: { email: 'trainer@test.com', role: 'TRAINER' } })
    const profile = await prisma.trainerProfile.create({
      data: { userId: trainerUser.id, verifiedLegalName: 'Test Trainer', approvedAt: new Date() },
    })
    await prisma.wallet.create({ data: { trainerId: profile.id, balance: 0 } })

    const course = await createCourse(profile.id, trainerUser.id, {
      title: 'Masterclass Node.js', blurb: 'Blurb', description: 'Description complète',
      category: 'dev', format: 'video', priceFcfa: 15000, durationSeconds: 3600,
    })
    await publishCourse(course.id, profile.id, trainerUser.id)

    const learner = await prisma.user.create({ data: { email: 'learner@test.com', role: 'LEARNER' } })
    const purchase = await initiatePurchase(course.id, learner.id, 'STRIPE')

    const moderator = await prisma.user.create({
      data: { email: 'moderation@test.com', role: 'ADMIN', adminRole: 'MODERATION' },
    })
    const finance = await prisma.user.create({
      data: { email: 'finances@test.com', role: 'ADMIN', adminRole: 'FINANCES' },
    })

    return { trainerUser, profile, course, learner, purchase, moderator, finance }
  }

  // -------------------------------------------------------------------------
  it('POST /api/me/disputes — 401 sans session, 201 puis 409 avec session', async () => {
    const { learner, purchase } = await setupScenario()

    signInAs(null)
    const anonymous = await openDisputeRoute(
      jsonRequest('http://localhost/api/me/disputes', { purchaseId: purchase.purchaseId, reason: 'OTHER' }),
    )
    expect(anonymous.status).toBe(401)
    expect((await anonymous.json()).error.code).toBe('UNAUTHORIZED')
    expect(await prisma.dispute.count()).toBe(0)

    signInAs({ id: learner.id, role: 'LEARNER' })
    const created = await openDisputeRoute(
      jsonRequest('http://localhost/api/me/disputes', {
        purchaseId: purchase.purchaseId, reason: 'CONTENT_MISMATCH', reasonDetail: 'Contenu non conforme.',
      }),
    )
    expect(created.status).toBe(201)
    expect((await created.json()).data.status).toBe('OPEN')

    // Décision 17 : un second litige sur la même vente est refusé
    const duplicate = await openDisputeRoute(
      jsonRequest('http://localhost/api/me/disputes', { purchaseId: purchase.purchaseId, reason: 'OTHER' }),
    )
    expect(duplicate.status).toBe(409)
    expect((await duplicate.json()).error.code).toBe('DISPUTE_ALREADY_ACTIVE')
  })

  // -------------------------------------------------------------------------
  it('POST /api/me/disputes — 400 sur motif invalide, 422 hors fenêtre 14 j', async () => {
    const { learner, purchase } = await setupScenario()
    signInAs({ id: learner.id, role: 'LEARNER' })

    const invalid = await openDisputeRoute(
      jsonRequest('http://localhost/api/me/disputes', { purchaseId: purchase.purchaseId, reason: 'PAS_UN_MOTIF' }),
    )
    expect(invalid.status).toBe(400)
    expect((await invalid.json()).error.code).toBe('VALIDATION_ERROR')

    await prisma.purchase.update({
      where: { id: purchase.purchaseId },
      data: { createdAt: new Date(Date.now() - 15 * 86400000) },
    })

    const tooLate = await openDisputeRoute(
      jsonRequest('http://localhost/api/me/disputes', { purchaseId: purchase.purchaseId, reason: 'OTHER' }),
    )
    expect(tooLate.status).toBe(422)
    expect((await tooLate.json()).error.code).toBe('DISPUTE_WINDOW_EXPIRED')
  })

  // -------------------------------------------------------------------------
  it('GET /api/me/disputes/[id] — un apprenant ne peut pas lire le litige d\'un autre', async () => {
    const { learner, purchase } = await setupScenario()
    const dispute = await openDispute(learner.id, { purchaseId: purchase.purchaseId, reason: 'ACCESS_ISSUE' })

    const intruder = await prisma.user.create({ data: { email: 'intruder@test.com', role: 'LEARNER' } })
    signInAs({ id: intruder.id, role: 'LEARNER' })

    const forbidden = await getMyDisputeRoute(new Request('http://localhost/x'), {
      params: Promise.resolve({ disputeId: dispute.id }),
    })
    expect(forbidden.status).toBe(403)
    expect((await forbidden.json()).error.code).toBe('NOT_OWNER')

    signInAs({ id: learner.id, role: 'LEARNER' })
    const owned = await getMyDisputeRoute(new Request('http://localhost/x'), {
      params: Promise.resolve({ disputeId: dispute.id }),
    })
    expect(owned.status).toBe(200)

    const list = await listMyDisputesRoute(new Request('http://localhost/api/me/disputes'))
    const listBody = await list.json()
    expect(listBody.meta.total).toBe(1)
  })

  // -------------------------------------------------------------------------
  it('routes admin — cloisonnement par sous-rôle', async () => {
    const { learner, moderator, finance } = await setupScenario()

    // Un apprenant n'accède pas aux routes de modération
    signInAs({ id: learner.id, role: 'LEARNER' })
    expect((await listAdminDisputesRoute(new Request('http://localhost/api/admin/disputes'))).status).toBe(403)

    // Finances n'a pas accès à la file des litiges (réservée Modération)
    signInAs({ id: finance.id, role: 'ADMIN', adminRole: 'FINANCES' })
    const financeOnDisputes = await listAdminDisputesRoute(new Request('http://localhost/api/admin/disputes'))
    expect(financeOnDisputes.status).toBe(403)
    expect((await financeOnDisputes.json()).error.code).toBe('FORBIDDEN_SUBROLE')

    // ... mais bien à la file des remboursements manuels
    expect((await listManualRefundTasksRoute(new Request('http://localhost/api/admin/manual-refund-tasks'))).status).toBe(200)

    // Modération : l'inverse exactement
    signInAs({ id: moderator.id, role: 'ADMIN', adminRole: 'MODERATION' })
    expect((await listAdminDisputesRoute(new Request('http://localhost/api/admin/disputes'))).status).toBe(200)
    expect((await listManualRefundTasksRoute(new Request('http://localhost/api/admin/manual-refund-tasks'))).status).toBe(403)

    // Les stats sont ouvertes aux deux
    expect((await adminStatsRoute()).status).toBe(200)
  })

  // -------------------------------------------------------------------------
  it('POST /resolve — 409 si expectedUpdatedAt est périmé (concurrence)', async () => {
    const { learner, purchase, moderator } = await setupScenario()
    const dispute = await openDispute(learner.id, { purchaseId: purchase.purchaseId, reason: 'OTHER' })

    signInAs({ id: moderator.id, role: 'ADMIN', adminRole: 'MODERATION' })

    const stale = await resolveRoute(
      jsonRequest('http://localhost/x', {
        resolution: 'REJECT',
        expectedUpdatedAt: new Date(Date.now() - 3600_000).toISOString(),
      }),
      { params: Promise.resolve({ disputeId: dispute.id }) },
    )
    expect(stale.status).toBe(409)
    expect((await stale.json()).error.code).toBe('STALE_DISPUTE')

    // Le litige n'a pas bougé et les fonds restent réservés
    const untouched = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })
    expect(untouched.status).toBe('OPEN')
    const reservation = await prisma.fundReservation.findFirstOrThrow({ where: { disputeId: dispute.id } })
    expect(reservation.status).toBe('ACTIVE')

    // Avec la bonne version, la résolution passe
    const ok = await resolveRoute(
      jsonRequest('http://localhost/x', {
        resolution: 'REJECT', expectedUpdatedAt: untouched.updatedAt.toISOString(),
      }),
      { params: Promise.resolve({ disputeId: dispute.id }) },
    )
    expect(ok.status).toBe(200)
  })

  // -------------------------------------------------------------------------
  it('POST /resolve — le bypass 14 j / 30 % est refusé à la Modération', async () => {
    const { learner, purchase, moderator } = await setupScenario()
    const dispute = await openDispute(learner.id, { purchaseId: purchase.purchaseId, reason: 'OTHER' })
    const current = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })

    signInAs({ id: moderator.id, role: 'ADMIN', adminRole: 'MODERATION' })
    const forbidden = await resolveRoute(
      jsonRequest('http://localhost/x', {
        resolution: 'FULL_REFUND',
        policyOverride: true,
        overrideJustification: 'Geste commercial exceptionnel demandé par la direction.',
        expectedUpdatedAt: current.updatedAt.toISOString(),
      }),
      { params: Promise.resolve({ disputeId: dispute.id }) },
    )
    expect(forbidden.status).toBe(403)
    expect((await forbidden.json()).error.code).toBe('OVERRIDE_FORBIDDEN')

    // Aucun débit n'a eu lieu
    const reservation = await prisma.fundReservation.findFirstOrThrow({ where: { disputeId: dispute.id } })
    expect(reservation.status).toBe('ACTIVE')
    expect(reservation.debitedAmount).toBe(0)
  })

  // -------------------------------------------------------------------------
  it('GET /api/trainer/disputes — la réponse HTTP ne contient jamais reasonDetail', async () => {
    const { profile, trainerUser, learner, purchase } = await setupScenario()
    await openDispute(learner.id, {
      purchaseId: purchase.purchaseId,
      reason: 'CONTENT_MISMATCH',
      reasonDetail: 'Motif libre strictement confidentiel.',
    })

    signInAs({ id: trainerUser.id, role: 'TRAINER', trainerId: profile.id })
    const res = await listTrainerDisputesRoute(new Request('http://localhost/api/trainer/disputes'))
    expect(res.status).toBe(200)

    const raw = JSON.stringify(await res.json())
    expect(raw).not.toContain('confidentiel')
    expect(raw).not.toContain('reasonDetail')
    expect(raw).toContain('CONTENT_MISMATCH')
  })

  // -------------------------------------------------------------------------
  it('POST /contest — 201 puis 409, et un formateur tiers est rejeté', async () => {
    const { profile, trainerUser, learner, purchase } = await setupScenario()
    const dispute = await openDispute(learner.id, { purchaseId: purchase.purchaseId, reason: 'OTHER' })

    // Formateur étranger au litige
    const otherUser = await prisma.user.create({ data: { email: 'other@test.com', role: 'TRAINER' } })
    const otherProfile = await prisma.trainerProfile.create({
      data: { userId: otherUser.id, verifiedLegalName: 'Autre' },
    })
    signInAs({ id: otherUser.id, role: 'TRAINER', trainerId: otherProfile.id })
    const foreign = await contestRoute(
      jsonRequest('http://localhost/x', { reason: 'Je conteste cette décision de litige.' }),
      { params: Promise.resolve({ disputeId: dispute.id }) },
    )
    expect(foreign.status).toBe(403)

    signInAs({ id: trainerUser.id, role: 'TRAINER', trainerId: profile.id })
    const created = await contestRoute(
      jsonRequest('http://localhost/x', { reason: 'Le contenu livré correspond à la description publiée.' }),
      { params: Promise.resolve({ disputeId: dispute.id }) },
    )
    expect(created.status).toBe(201)

    const duplicate = await contestRoute(
      jsonRequest('http://localhost/x', { reason: 'Le contenu livré correspond à la description publiée.' }),
      { params: Promise.resolve({ disputeId: dispute.id }) },
    )
    expect(duplicate.status).toBe(409)
    expect((await duplicate.json()).error.code).toBe('CONTEST_ALREADY_OPEN')
    expect(await prisma.supportTicket.count()).toBe(1)
  })

  // -------------------------------------------------------------------------
  it('POST /api/me/disputes/[id]/messages — 409 sur un litige clos', async () => {
    const { learner, purchase, moderator } = await setupScenario()
    const dispute = await openDispute(learner.id, { purchaseId: purchase.purchaseId, reason: 'OTHER' })
    const current = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })

    signInAs({ id: moderator.id, role: 'ADMIN', adminRole: 'MODERATION' })
    await resolveRoute(
      jsonRequest('http://localhost/x', { resolution: 'REJECT', expectedUpdatedAt: current.updatedAt.toISOString() }),
      { params: Promise.resolve({ disputeId: dispute.id }) },
    )

    signInAs({ id: learner.id, role: 'LEARNER' })
    const closed = await postLearnerMessageRoute(
      jsonRequest('http://localhost/x', { body: 'Je souhaite ajouter un élément.' }),
      { params: Promise.resolve({ disputeId: dispute.id }) },
    )
    expect(closed.status).toBe(409)
    expect((await closed.json()).error.code).toBe('DISPUTE_CLOSED')
  })
})
