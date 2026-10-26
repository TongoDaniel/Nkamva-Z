// ==========================================================================
// Comptes — campagne du 12 octobre 2026, m14 et m16
// ==========================================================================
// m14 — L'inscription et la réinitialisation n'exigeaient que 10 caractères,
//       le changement de mot de passe 10 + une majuscule + un chiffre ; et un
//       mot de passe identique à l'adresse e-mail était accepté.
// m16 — Redemander la suppression du compte repoussait l'échéance de trente
//       jours à chaque fois.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { passwordProblem, PASSWORD_IS_EMAIL_ERROR } from '@/lib/validation'
import { requestDeletion } from '@/lib/profile'
import { POST as registerRoute } from '@/app/api/auth/register/route'

function register(body: Record<string, unknown>, ip: string) {
  return registerRoute(new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  }))
}

describe('m14 — une seule règle de mot de passe', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  it('les trois règles et l\'adresse e-mail', () => {
    expect(passwordProblem('motdepasse12')).toMatch(/majuscule/)
    expect(passwordProblem('Motdepasselong')).toMatch(/chiffre/)
    expect(passwordProblem('Paul2026@nkamva.cm', 'paul2026@nkamva.cm')).toBe(PASSWORD_IS_EMAIL_ERROR)
    expect(passwordProblem('Paul2026nk', 'paul2026nk@nkamva.cm')).toBe(PASSWORD_IS_EMAIL_ERROR)
    expect(passwordProblem('Couture2026!', 'paul@nkamva.cm')).toBeNull()
  })

  it('l\'inscription refuse ce que le changement de mot de passe refusait', async () => {
    const weak = await register({ email: 'a@test.com', password: 'abcdefghij', fullName: 'Awa Sarr' }, '10.0.0.1')
    expect(weak.status).toBe(400)
    const asEmail = await register(
      { email: 'Paul2026@test.com', password: 'Paul2026@test.com', fullName: 'Paul Biya' }, '10.0.0.2',
    )
    expect(asEmail.status).toBe(400)
    expect((await asEmail.json()).error.message).toBe(PASSWORD_IS_EMAIL_ERROR)
    expect(await prisma.user.count()).toBe(0)
  })
})

describe('m16 — redemander la suppression ne repousse rien', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  it('la seconde demande rend la même échéance', async () => {
    const user = await prisma.user.create({ data: { email: 'xss@test.com', role: 'LEARNER' } })

    const first = await requestDeletion(user.id, null)
    await new Promise((resolve) => setTimeout(resolve, 20))
    const second = await requestDeletion(user.id, null)

    expect(first.ok && second.ok).toBe(true)
    if (first.ok && second.ok) expect(second.scheduledAt).toBe(first.scheduledAt)
  })
})
