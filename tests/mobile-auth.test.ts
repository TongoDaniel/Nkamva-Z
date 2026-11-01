// ==========================================================================
// Application mobile — jeton porteur (`src/lib/mobile-auth.ts`)
// ==========================================================================
// Le jeton de l'app doit obéir aux mêmes règles que le cookie du site : il
// tombe avec `sessionsValidAfter`, avec la suspension ou la suppression du
// compte, et un jeton forgé ou altéré ne vaut rien.
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { encode } from 'next-auth/jwt'
import { prisma, cleanDatabase } from './setup'
import { issueMobileToken, revokeMobileToken, sessionUserFromMobileToken } from '@/lib/mobile-auth'

describe('Jeton porteur de l’application mobile', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function makeUser(overrides: Record<string, unknown> = {}) {
    return prisma.user.create({ data: { email: 'mobile@test.com', role: 'LEARNER', ...overrides } })
  }

  function asAuthorized(user: { id: string; email: string; sessionsValidAfter: Date }) {
    return { id: user.id, email: user.email, role: 'LEARNER', adminRole: null, trainerId: null, sessionsValidAfter: user.sessionsValidAfter.toISOString() }
  }

  it('un jeton émis ouvre la session de son utilisateur', async () => {
    const user = await makeUser()
    const token = await issueMobileToken(asAuthorized(user))
    const sessionUser = await sessionUserFromMobileToken(token)
    expect(sessionUser?.id).toBe(user.id)
    expect(sessionUser?.role).toBe('LEARNER')
  })

  it('une révocation par sessionsValidAfter coupe le jeton', async () => {
    const user = await makeUser({ sessionsValidAfter: new Date(Date.now() - 60_000) })
    const token = await issueMobileToken(asAuthorized(user))
    await prisma.user.update({ where: { id: user.id }, data: { sessionsValidAfter: new Date(Date.now() + 2_000) } })
    // Le jeton garde l'ancienne date tant qu'il n'est pas rafraîchi depuis la
    // base : on simule un jeton âgé de plus de cinq minutes, comme le fait
    // le test de révocation du cookie.
    const stale = await encode({
      token: { userId: user.id, email: user.email, role: 'LEARNER', adminRole: null, trainerId: null, issuedAt: Math.floor(Date.now() / 1000) - 600, sessionsValidAfter: user.sessionsValidAfter.toISOString() },
      secret: process.env.NEXTAUTH_SECRET!,
    })
    expect(await sessionUserFromMobileToken(stale)).toBeNull()
    expect(token).toBeTruthy()
  })

  it('un compte suspendu perd sa session au rafraîchissement', async () => {
    const user = await makeUser()
    await prisma.user.update({ where: { id: user.id }, data: { suspendedAt: new Date() } })
    const stale = await encode({
      token: { userId: user.id, email: user.email, role: 'LEARNER', adminRole: null, trainerId: null, issuedAt: Math.floor(Date.now() / 1000) - 600, sessionsValidAfter: user.sessionsValidAfter.toISOString() },
      secret: process.env.NEXTAUTH_SECRET!,
    })
    expect(await sessionUserFromMobileToken(stale)).toBeNull()
  })

  it('un jeton chiffré avec un autre secret ne vaut rien', async () => {
    const user = await makeUser()
    const forged = await encode({
      token: { userId: user.id, email: user.email, role: 'ADMIN', adminRole: null, trainerId: null, issuedAt: Math.floor(Date.now() / 1000), sessionsValidAfter: user.sessionsValidAfter.toISOString() },
      secret: 'un-autre-secret-que-celui-du-serveur-0123456789',
    })
    expect(await sessionUserFromMobileToken(forged)).toBeNull()
  })

  it('la déconnexion révoque le jeton côté serveur', async () => {
    const user = await makeUser()
    const token = await issueMobileToken(asAuthorized(user))
    expect(await sessionUserFromMobileToken(token)).not.toBeNull()
    expect(await revokeMobileToken(token)).toBe(true)
    // Une copie du jeton, prise avant la déconnexion, ne sert plus à rien.
    expect(await sessionUserFromMobileToken(token)).toBeNull()
    // Révoquer deux fois ne casse rien.
    expect(await revokeMobileToken(token)).toBe(true)
  })

  it('révoquer un jeton ne touche pas les autres jetons du même compte', async () => {
    const user = await makeUser()
    const first = await issueMobileToken(asAuthorized(user))
    const second = await issueMobileToken(asAuthorized(user))
    await revokeMobileToken(first)
    expect(await sessionUserFromMobileToken(second)).not.toBeNull()
  })

  it('un jeton illisible ne se révoque pas', async () => {
    expect(await revokeMobileToken('pas-un-jeton')).toBe(false)
    expect(await revokeMobileToken('')).toBe(false)
  })

  it('un jeton vide ou illisible ne vaut rien', async () => {
    expect(await sessionUserFromMobileToken('')).toBeNull()
    expect(await sessionUserFromMobileToken('pas-un-jeton')).toBeNull()
  })
})
