// ==========================================================================
// Connexion — ce que la réponse ne doit pas révéler (`authorizeCredentials`)
// ==========================================================================
// Un inconnu ne doit pas pouvoir apprendre, en essayant des adresses, qu'un
// compte existe ni qu'il est suspendu. Le site et l'app mobile passent tous
// deux par cette fonction.
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { authorizeCredentials } from '@/lib/auth'
import { hashPassword } from '@/lib/password'

const PASSWORD = 'Un-mot-de-passe-solide-2026'

// Chaque essai a sa propre adresse IP et sa propre adresse e-mail : aucun
// plafond anti-force brute n'est atteint.
describe('Connexion sans oracle', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  async function suspendedUser() {
    return prisma.user.create({
      data: { email: 'suspendu@test.com', role: 'LEARNER', passwordHash: await hashPassword(PASSWORD), suspendedAt: new Date() },
    })
  }

  it('un compte suspendu, mauvais mot de passe : même réponse qu’une adresse inconnue', async () => {
    await suspendedUser()
    const suspended = await authorizeCredentials({ email: 'suspendu@test.com', password: 'faux-mot-de-passe' }, { headers: { 'x-forwarded-for': '10.0.0.1' } })
    const unknown = await authorizeCredentials({ email: 'personne@test.com', password: 'faux-mot-de-passe' }, { headers: { 'x-forwarded-for': '10.0.0.2' } })
    expect(suspended).toBeNull()
    expect(unknown).toBeNull()
  })

  it('la suspension n’est annoncée qu’à qui donne le bon mot de passe', async () => {
    await suspendedUser()
    await expect(
      authorizeCredentials({ email: 'suspendu@test.com', password: PASSWORD }, { headers: { 'x-forwarded-for': '10.0.0.3' } }),
    ).rejects.toThrow('ACCOUNT_SUSPENDED')
  })

  it('une adresse inconnue fait tourner Argon2 comme une adresse connue', async () => {
    await prisma.user.create({ data: { email: 'connu@test.com', role: 'LEARNER', passwordHash: await hashPassword(PASSWORD) } })
    // Premier appel : l'empreinte leurre se calcule une fois.
    await authorizeCredentials({ email: 'echauffement@test.com', password: 'x' }, { headers: { 'x-forwarded-for': '10.0.0.4' } })

    const time = async (email: string, ip: string) => {
      const start = performance.now()
      await authorizeCredentials({ email, password: 'mauvais-mot-de-passe' }, { headers: { 'x-forwarded-for': ip } })
      return performance.now() - start
    }
    const known = await time('connu@test.com', '10.0.0.5')
    const unknown = await time('inconnu@test.com', '10.0.0.6')
    // Sans leurre, l'inconnu répondait en quelques millisecondes contre une
    // centaine. Avec, les deux restent du même ordre.
    expect(unknown).toBeGreaterThan(known / 3)
  })
})
