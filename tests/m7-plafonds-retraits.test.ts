// ==========================================================================
// Plafonds des retraits — campagne du 12 octobre 2026, M7
// ==========================================================================
// Les deux plafonds (3 retraits, 3 moyens de paiement par 24 h) étaient
// consommés **avant** la validation : trois refus — moyen non vérifié, montant
// trop bas, second facteur pas encore activé — bloquaient le formateur une
// journée entière, avec « réessayez plus tard » pour toute explication.
//
// Ce qui doit rester plafonné, en revanche : un code de second facteur faux.
// C'est la seule chose qu'on pourrait deviner par essais répétés.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as OTPAuth from 'otpauth'
import { prisma, cleanDatabase } from './setup'
import { beginTwoFactorSetup, enableTwoFactor } from '@/lib/two-factor'
import { hashPassword } from '@/lib/password'
import { RATE_LIMITS } from '@/lib/rate-limit'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
import { getServerSession } from 'next-auth'

import { POST as createMethodRoute } from '@/app/api/trainer/payout-methods/route'
import { POST as requestPayoutRoute } from '@/app/api/trainer/payouts/route'

function signInAs(user: { id: string; trainerId: string }) {
  vi.mocked(getServerSession).mockResolvedValue(
    { user: { email: 'x@test.com', adminRole: null, role: 'TRAINER', ...user } } as never,
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

describe('M7 — un refus ne consomme pas le plafond', () => {
  beforeEach(async () => {
    await cleanDatabase()
    process.env.NEXTAUTH_SECRET = 'secret-de-test-suffisamment-long-0123456789'
  })
  afterEach(async () => { await cleanDatabase(); vi.clearAllMocks() })

  async function trainer(email: string) {
    const user = await prisma.user.create({
      data: { email, role: 'TRAINER', passwordHash: await hashPassword('MotDePasse1') },
    })
    const profile = await prisma.trainerProfile.create({
      data: { userId: user.id, verifiedLegalName: 'Marie Formatrice', approvedAt: new Date(Date.now() - 40 * 86400000) },
    })
    await prisma.wallet.create({ data: { trainerId: profile.id, balance: 100_000 } })
    signInAs({ id: user.id, trainerId: profile.id })
    return { user, profile }
  }

  it('des demandes de retrait refusées ne bloquent pas la suivante', async () => {
    await trainer('retraits@test.com')
    const { max } = RATE_LIMITS.PAYOUT_CREATE

    // Aucun moyen de paiement vérifié : chaque demande est refusée par le
    // service. Avant le correctif, la quatrième recevait un 429.
    for (let i = 0; i <= max; i++) {
      const res = await requestPayoutRoute(jsonRequest({ amountFcfa: 10_000 }))
      expect(res.status).not.toBe(429)
      expect(res.status).not.toBe(201)
    }
  })

  it('des refus « second facteur à activer » ne consomment pas le plafond des moyens', async () => {
    await trainer('sans2fa@test.com')
    const { max } = RATE_LIMITS.PAYOUT_METHOD_CREATE

    for (let i = 0; i <= max; i++) {
      const res = await createMethodRoute(jsonRequest(IBAN_BODY))
      expect(res.status).not.toBe(429)
    }
  })

  it('des codes de second facteur faux restent plafonnés, et le délai est dit', async () => {
    const { user } = await trainer('devine@test.com')
    const { secret } = await beginTwoFactorSetup(user.id, 'MotDePasse1')
    await enableTwoFactor(user.id, new OTPAuth.TOTP({
      issuer: 'NKAMVA', algorithm: 'SHA1', digits: 6, period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    }).generate())
    const { max } = RATE_LIMITS.PAYOUT_METHOD_CREATE

    for (let i = 0; i < max; i++) {
      const res = await createMethodRoute(jsonRequest({ ...IBAN_BODY, twoFactorCode: '000000' }))
      expect(res.status).not.toBe(429)
    }
    const blocked = await createMethodRoute(jsonRequest({ ...IBAN_BODY, twoFactorCode: '000000' }))
    expect(blocked.status).toBe(429)
    // « Réessayez plus tard » laissait croire à une panne passagère.
    expect((await blocked.json()).error.message).toMatch(/Réessayez dans \d+ (h|min|s)/)
  })
})
