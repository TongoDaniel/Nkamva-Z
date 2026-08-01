// ==========================================================================
// Lot 3 — Routes HTTP : RBAC, validation, concurrence
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prisma, cleanDatabase } from './setup'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
import { getServerSession } from 'next-auth'

import { createPayoutMethod, verifyPayoutMethod, expirePayoutMethodCarence } from '@/lib/payout-methods'
import { requestPayout } from '@/lib/payouts'

import { GET as kycScoreRoute } from '@/app/api/trainer/kyc-score/route'
import { POST as createMethodRoute } from '@/app/api/trainer/payout-methods/route'
import { POST as requestPayoutRoute } from '@/app/api/trainer/payouts/route'
import { GET as adminMethodsRoute } from '@/app/api/admin/payout-methods/route'
import { GET as adminMethodDetailRoute } from '@/app/api/admin/payout-methods/[payoutMethodId]/route'
import { GET as escalationsRoute } from '@/app/api/admin/payout-methods/escalations/route'
import { POST as escalationResolveRoute } from '@/app/api/admin/payout-methods/[payoutMethodId]/escalation-resolve/route'
import { GET as adminPayoutsRoute } from '@/app/api/admin/payouts/route'
import { POST as approvePayoutRoute } from '@/app/api/admin/payouts/[payoutId]/approve/route'
import { POST as reconcileReservedRoute } from '@/app/api/admin/wallets/[walletId]/reconcile-reserved-balance/route'

type SessionUser = {
  id: string
  role: 'LEARNER' | 'TRAINER' | 'ADMIN'
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
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

const IBAN_BODY = {
  type: 'BANK_IBAN', accountNature: 'INDIVIDUAL',
  holderName: 'Marie Formatrice', iban: 'FR7630006000011234567890189', bic: 'AGRIFRPP',
}

describe('Lot 3 — Routes', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase(); vi.clearAllMocks() })

  async function setupActors(opts: { legalName?: string | null } = {}) {
    const trainerUser = await prisma.user.create({ data: { email: 'formateur@test.com', role: 'TRAINER' } })
    const profile = await prisma.trainerProfile.create({
      data: {
        userId: trainerUser.id,
        verifiedLegalName: opts.legalName === undefined ? 'Marie Formatrice' : opts.legalName,
        approvedAt: new Date(Date.now() - 40 * 86400000),
      },
    })
    const wallet = await prisma.wallet.create({ data: { trainerId: profile.id, balance: 100_000 } })
    const moderator = await prisma.user.create({
      data: { email: 'moderation@test.com', role: 'ADMIN', adminRole: 'MODERATION' },
    })
    const finance = await prisma.user.create({
      data: { email: 'finances@test.com', role: 'ADMIN', adminRole: 'FINANCES' },
    })
    const superAdmin = await prisma.user.create({
      data: { email: 'super@test.com', role: 'ADMIN', adminRole: 'SUPER_ADMIN' },
    })
    return { trainerUser, profile, wallet, moderator, finance, superAdmin }
  }

  // -------------------------------------------------------------------------
  it('POST /api/trainer/payout-methods — 401 sans session, 201 avec, 409 sans nom légal', async () => {
    signInAs(null)
    expect((await createMethodRoute(jsonRequest(IBAN_BODY))).status).toBe(401)

    // Décision 21 — sans verifiedLegalName, la vérification est impossible
    const noName = await setupActors({ legalName: null })
    signInAs({ id: noName.trainerUser.id, role: 'TRAINER', trainerId: noName.profile.id })
    const blocked = await createMethodRoute(jsonRequest(IBAN_BODY))
    expect(blocked.status).toBe(409)
    expect((await blocked.json()).error.code).toBe('IDENTITY_NAME_MISSING')

    await cleanDatabase()
    const { trainerUser, profile } = await setupActors()
    signInAs({ id: trainerUser.id, role: 'TRAINER', trainerId: profile.id })
    const created = await createMethodRoute(jsonRequest(IBAN_BODY))
    expect(created.status).toBe(201)
    expect((await created.json()).data.verificationStatus).toBe('PENDING_REVIEW')
  })

  // -------------------------------------------------------------------------
  it('décision 28 — BUSINESS exige dénomination, immatriculation et preuve de représentation', async () => {
    const { trainerUser, profile } = await setupActors()
    signInAs({ id: trainerUser.id, role: 'TRAINER', trainerId: profile.id })

    const incomplete = await createMethodRoute(jsonRequest({
      ...IBAN_BODY, accountNature: 'BUSINESS', businessName: 'NkamVa SARL',
    }))
    expect(incomplete.status).toBe(400)
    expect((await incomplete.json()).error.code).toBe('BUSINESS_DOC_REQUIRED')

    const complete = await createMethodRoute(jsonRequest({
      ...IBAN_BODY, accountNature: 'BUSINESS', businessName: 'NkamVa SARL',
      businessDocS3Key: 'docs/rccm.pdf', legalRepProofS3Key: 'docs/rep.pdf',
    }))
    expect(complete.status).toBe(201)
  })

  // -------------------------------------------------------------------------
  // Décision 20 — Modération n'a AUCUN accès aux moyens de paiement,
  // symétrique de la décision 7 (Finances n'accède pas aux pièces d'identité).
  it('décision 20 — Modération est exclue de tout le Lot 3', async () => {
    const { trainerUser, profile, moderator, finance } = await setupActors()
    const method = await createPayoutMethod(profile.id, trainerUser.id, IBAN_BODY as never)

    signInAs({ id: moderator.id, role: 'ADMIN', adminRole: 'MODERATION' })
    for (const [label, res] of [
      ['liste moyens', await adminMethodsRoute(new Request('http://localhost/api/admin/payout-methods'))],
      ['détail moyen', await adminMethodDetailRoute(new Request('http://localhost/x'), {
        params: Promise.resolve({ payoutMethodId: method.id }),
      })],
      ['liste retraits', await adminPayoutsRoute(new Request('http://localhost/api/admin/payouts'))],
    ] as const) {
      expect(res.status, `Modération ne doit pas accéder à : ${label}`).toBe(403)
    }

    // Finances, elle, instruit bien les moyens de paiement
    signInAs({ id: finance.id, role: 'ADMIN', adminRole: 'FINANCES' })
    expect((await adminMethodsRoute(new Request('http://localhost/api/admin/payout-methods'))).status).toBe(200)
    expect((await adminPayoutsRoute(new Request('http://localhost/api/admin/payouts'))).status).toBe(200)
  })

  // -------------------------------------------------------------------------
  it('escalades et réconciliation : Super-admin uniquement, Finances refusée', async () => {
    const { wallet, finance, superAdmin } = await setupActors()

    signInAs({ id: finance.id, role: 'ADMIN', adminRole: 'FINANCES' })
    expect((await escalationsRoute(new Request('http://localhost/api/admin/payout-methods/escalations'))).status).toBe(403)
    const reconcileForbidden = await reconcileReservedRoute(
      jsonRequest({ reason: 'Correction demandée par la comptabilité.' }),
      { params: Promise.resolve({ walletId: wallet.id }) },
    )
    expect(reconcileForbidden.status).toBe(403)

    signInAs({ id: superAdmin.id, role: 'ADMIN', adminRole: 'SUPER_ADMIN' })
    expect((await escalationsRoute(new Request('http://localhost/api/admin/payout-methods/escalations'))).status).toBe(200)

    await prisma.wallet.update({ where: { id: wallet.id }, data: { reservedBalance: 5000 } })
    const reconciled = await reconcileReservedRoute(
      jsonRequest({ reason: 'Écart détecté par le job de cohérence quotidien.' }),
      { params: Promise.resolve({ walletId: wallet.id }) },
    )
    expect(reconciled.status).toBe(200)
    const body = await reconciled.json()
    expect(body.data.corrected).toBe(true)
    expect(body.data.newValue).toBe(0)
  })

  // -------------------------------------------------------------------------
  it('escalation-resolve — justification trop courte refusée en 400', async () => {
    const { profile, trainerUser, superAdmin } = await setupActors()
    const method = await createPayoutMethod(profile.id, trainerUser.id, IBAN_BODY as never)
    await prisma.payoutMethod.update({ where: { id: method.id }, data: { verificationStatus: 'BLOCKED' } })

    signInAs({ id: superAdmin.id, role: 'ADMIN', adminRole: 'SUPER_ADMIN' })
    const tooShort = await escalationResolveRoute(
      jsonRequest({ action: 'FORCE_VERIFY', justification: 'ok' }),
      { params: Promise.resolve({ payoutMethodId: method.id }) },
    )
    expect(tooShort.status).toBe(400)

    const ok = await escalationResolveRoute(
      jsonRequest({ action: 'FORCE_VERIFY', justification: 'Pièces complémentaires vérifiées par le Super-admin.' }),
      { params: Promise.resolve({ payoutMethodId: method.id }) },
    )
    expect(ok.status).toBe(200)
  })

  // -------------------------------------------------------------------------
  it('POST /api/trainer/payouts — 422 sous le minimum, 422 sans moyen vérifié', async () => {
    const { trainerUser, profile, finance } = await setupActors()
    signInAs({ id: trainerUser.id, role: 'TRAINER', trainerId: profile.id })

    // Le minimum est aussi porté par le schéma zod : 400 avant d'atteindre le service
    const tooSmall = await requestPayoutRoute(jsonRequest({ amountFcfa: 5000 }))
    expect(tooSmall.status).toBe(400)

    const noMethod = await requestPayoutRoute(jsonRequest({ amountFcfa: 20_000 }))
    expect(noMethod.status).toBe(422)
    expect((await noMethod.json()).error.code).toBe('PAYOUT_METHOD_MISSING')

    // Moyen créé mais en carence → toujours refusé
    const method = await createPayoutMethod(profile.id, trainerUser.id, IBAN_BODY as never)
    await verifyPayoutMethod(method.id, {
      method: 'MANUAL_FINANCE',
      expectedUpdatedAt: (await prisma.payoutMethod.findUniqueOrThrow({ where: { id: method.id } })).updatedAt.toISOString(),
      actorId: finance.id, actorRole: 'FINANCES',
    })
    const inCarence = await requestPayoutRoute(jsonRequest({ amountFcfa: 20_000 }))
    expect(inCarence.status).toBe(422)
    expect((await inCarence.json()).error.code).toBe('PAYOUT_METHOD_CARENCE')
  })

  // -------------------------------------------------------------------------
  it('POST /approve — 409 si expectedUpdatedAt est périmé', async () => {
    const { trainerUser, profile, finance } = await setupActors()
    const method = await createPayoutMethod(profile.id, trainerUser.id, IBAN_BODY as never)
    await verifyPayoutMethod(method.id, {
      method: 'MANUAL_FINANCE',
      expectedUpdatedAt: (await prisma.payoutMethod.findUniqueOrThrow({ where: { id: method.id } })).updatedAt.toISOString(),
      actorId: finance.id, actorRole: 'FINANCES',
    })
    await prisma.payoutMethod.update({ where: { id: method.id }, data: { carenceUntil: new Date(Date.now() - 1000) } })
    await expirePayoutMethodCarence()

    const payout = await requestPayout(profile.id, trainerUser.id, 20_000)

    signInAs({ id: finance.id, role: 'ADMIN', adminRole: 'FINANCES' })
    const stale = await approvePayoutRoute(
      jsonRequest({ expectedUpdatedAt: new Date(0).toISOString() }),
      { params: Promise.resolve({ payoutId: payout.id }) },
    )
    expect(stale.status).toBe(409)
    expect((await stale.json()).error.code).toBe('STALE_PAYOUT')

    const fresh = await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } })
    const ok = await approvePayoutRoute(
      jsonRequest({ expectedUpdatedAt: fresh.updatedAt.toISOString() }),
      { params: Promise.resolve({ payoutId: payout.id }) },
    )
    expect(ok.status).toBe(200)
    expect((await ok.json()).data.status).toBe('APPROVED')
  })

  // -------------------------------------------------------------------------
  it('GET /api/trainer/kyc-score — réservé au formateur', async () => {
    const { trainerUser, profile, finance } = await setupActors()

    signInAs({ id: finance.id, role: 'ADMIN', adminRole: 'FINANCES' })
    const notTrainer = await kycScoreRoute()
    expect(notTrainer.status).toBe(403)
    expect((await notTrainer.json()).error.code).toBe('NOT_TRAINER')

    signInAs({ id: trainerUser.id, role: 'TRAINER', trainerId: profile.id })
    const res = await kycScoreRoute()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.badge).toBeTruthy()
    expect(body.data.criteria).toHaveProperty('ribVerified')
  })
})
