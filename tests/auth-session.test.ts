// ==========================================================================
// Lot 0 — Révocation de session par `sessionsValidAfter`
// ==========================================================================
// Les transitions de rôle du Lot 1 (T2/T3/T6/T8) bumpent `sessionsValidAfter`.
// Ce fichier vérifie que ce bump a réellement un effet.
//
// Piège corrigé : `token.iat` est réémis par NextAuth à CHAQUE requête, il ne
// peut donc pas servir de date d'ouverture de session — la comparaison
// `iat < sessionsValidAfter` n'était jamais vraie. On fige `token.issuedAt` à
// la connexion.
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { authOptions } from '@/lib/auth'

const sessionCallback = authOptions.callbacks!.session!
const jwtCallback = authOptions.callbacks!.jwt!

function nowSeconds() { return Math.floor(Date.now() / 1000) }

async function callSession(token: Record<string, unknown>) {
  const result = await sessionCallback({
    session: { user: { name: null, email: 'x@test.com', image: null }, expires: '' },
    token,
  } as never)
  return result as unknown as { user?: { role?: string; trainerId?: string | null } }
}

describe('Révocation de session', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function makeUser(overrides: Record<string, unknown> = {}) {
    return prisma.user.create({
      data: { email: 'session@test.com', role: 'LEARNER', ...overrides },
    })
  }

  // -------------------------------------------------------------------------
  it('le JWT fige issuedAt à la connexion', async () => {
    const user = await makeUser()
    const token = await jwtCallback({
      token: {},
      user: {
        id: user.id, email: user.email, role: 'LEARNER', adminRole: null,
        trainerId: null, sessionsValidAfter: user.sessionsValidAfter.toISOString(),
      },
    } as never) as Record<string, unknown>

    expect(typeof token.issuedAt).toBe('number')
    expect(token.userId).toBe(user.id)
  })

  // -------------------------------------------------------------------------
  it('une session ouverte AVANT un bump est révoquée au rafraîchissement', async () => {
    const user = await makeUser()
    const openedAt = nowSeconds() - 400 // au-delà des 300 s : la base est relue

    // Le rôle bascule et sessionsValidAfter est bumpé (ce que fait le Lot 1)
    await prisma.user.update({
      where: { id: user.id },
      data: { role: 'PENDING_TRAINER', sessionsValidAfter: new Date() },
    })

    const result = await callSession({
      userId: user.id, role: 'LEARNER', adminRole: null, trainerId: null,
      sessionsValidAfter: user.sessionsValidAfter.toISOString(),
      issuedAt: openedAt, iat: nowSeconds(), // iat « frais », comme le réémet NextAuth
    })

    expect(result.user).toBeUndefined()
  })

  // -------------------------------------------------------------------------
  it('une session ouverte APRÈS le bump reste valide et voit le rôle à jour', async () => {
    const user = await makeUser()
    await prisma.user.update({
      where: { id: user.id },
      data: { role: 'TRAINER', sessionsValidAfter: new Date(Date.now() - 600_000) },
    })
    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })

    const result = await callSession({
      userId: user.id, role: 'LEARNER', adminRole: null, trainerId: null,
      sessionsValidAfter: refreshed.sessionsValidAfter.toISOString(),
      issuedAt: nowSeconds() - 400, iat: nowSeconds(),
    })

    expect(result.user).toBeDefined()
    // Le rôle vient de la base, pas du token périmé
    expect(result.user!.role).toBe('TRAINER')
  })

  // -------------------------------------------------------------------------
  it('un compte suspendu perd sa session au rafraîchissement', async () => {
    const user = await makeUser({ suspendedAt: new Date() })

    const result = await callSession({
      userId: user.id, role: 'LEARNER', adminRole: null, trainerId: null,
      sessionsValidAfter: user.sessionsValidAfter.toISOString(),
      issuedAt: nowSeconds() - 400, iat: nowSeconds(),
    })

    expect(result.user).toBeUndefined()
  })

  // -------------------------------------------------------------------------
  it('un token récent est servi sans relire la base (compromis JWT assumé)', async () => {
    // Session ouverte il y a 10 s, sur un sessionsValidAfter d'il y a 1 h.
    const openedOn = new Date(Date.now() - 3600_000)
    const user = await makeUser({ sessionsValidAfter: openedOn })

    // La base bumpe MAINTENANT, après l'ouverture de session.
    await prisma.user.update({
      where: { id: user.id },
      data: { role: 'TRAINER', sessionsValidAfter: new Date() },
    })

    const result = await callSession({
      userId: user.id, role: 'LEARNER', adminRole: null, trainerId: null,
      // Le token porte encore la valeur connue à la connexion.
      sessionsValidAfter: openedOn.toISOString(),
      issuedAt: nowSeconds() - 10, iat: nowSeconds(),
    })

    // Moins de 300 s : le rôle du token fait foi, la révocation attend le
    // prochain rafraîchissement. C'est la latence documentée du modèle JWT.
    expect(result.user).toBeDefined()
    expect(result.user!.role).toBe('LEARNER')
  })
})
