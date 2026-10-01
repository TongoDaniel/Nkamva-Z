// ==========================================================================
// Lot 0 — Socle d'authentification (inscription, OTP, réinitialisation)
// ==========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma, cleanDatabase } from './setup'
import { issueOtp, consumeOtp, peekOtp, OTP_MAX_ATTEMPTS } from '@/lib/otp'
import { isSessionRevoked } from '@/lib/session-validity'
import { hashPassword } from '@/lib/password'
import { authOptions, authorizeCredentials } from '@/lib/auth'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { POST as registerHandler } from '@/app/api/auth/register/route'
import { POST as resetPasswordHandler } from '@/app/api/auth/reset-password/route'

function jsonRequest(url: string, body: unknown, ip: string) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
}

let ipCounter = 0
/** Une IP distincte par test : le rate limit est un compteur en mémoire partagé. */
function nextIp() {
  ipCounter += 1
  return `10.0.0.${ipCounter}`
}

describe('Lot 0 — Socle authentification', () => {
  beforeEach(async () => { await cleanDatabase() })
  afterEach(async () => { await cleanDatabase() })

  describe('OTP', () => {
    it('consomme un code valide une seule fois', async () => {
      const code = await issueOtp('a@test.com', null, 'EMAIL_VERIFICATION')

      const first = await consumeOtp('a@test.com', code, 'EMAIL_VERIFICATION')
      expect(first).toEqual({ ok: true, userId: null })

      const second = await consumeOtp('a@test.com', code, 'EMAIL_VERIFICATION')
      expect(second).toEqual({ ok: false, reason: 'OTP_INVALID' })
    })

    it('émettre un nouveau code invalide le précédent (même usage)', async () => {
      const first = await issueOtp('b@test.com', null, 'EMAIL_VERIFICATION')
      const second = await issueOtp('b@test.com', null, 'EMAIL_VERIFICATION')

      expect(await consumeOtp('b@test.com', first, 'EMAIL_VERIFICATION')).toEqual({ ok: false, reason: 'OTP_INVALID' })
      expect(await consumeOtp('b@test.com', second, 'EMAIL_VERIFICATION')).toEqual({ ok: true, userId: null })
    })

    it('bloque le code après OTP_MAX_ATTEMPTS échecs, même avec le bon code ensuite', async () => {
      const code = await issueOtp('c@test.com', null, 'EMAIL_VERIFICATION')
      const wrong = code === '000000' ? '999999' : '000000'

      for (let i = 0; i < OTP_MAX_ATTEMPTS - 1; i++) {
        expect(await consumeOtp('c@test.com', wrong, 'EMAIL_VERIFICATION')).toEqual({ ok: false, reason: 'OTP_INVALID' })
      }
      expect(await consumeOtp('c@test.com', wrong, 'EMAIL_VERIFICATION')).toEqual({ ok: false, reason: 'OTP_TOO_MANY_ATTEMPTS' })
      expect(await consumeOtp('c@test.com', code, 'EMAIL_VERIFICATION')).toEqual({ ok: false, reason: 'OTP_TOO_MANY_ATTEMPTS' })
    })

    it('refuse un code expiré', async () => {
      const code = await issueOtp('d@test.com', null, 'EMAIL_VERIFICATION')
      await prisma.emailOtp.updateMany({
        where: { email: 'd@test.com' },
        data: { expiresAt: new Date(Date.now() - 1000) },
      })

      expect(await consumeOtp('d@test.com', code, 'EMAIL_VERIFICATION')).toEqual({ ok: false, reason: 'OTP_EXPIRED' })
    })

    it('peekOtp valide SANS consommer : le parcours reset (verify-otp puis reset-password) aboutit', async () => {
      const code = await issueOtp('peek@test.com', null, 'PASSWORD_RESET')

      // Écran « saisir le code » : on valide sans consommer.
      expect(await peekOtp('peek@test.com', code, 'PASSWORD_RESET')).toEqual({ ok: true, userId: null })
      // Un peek ne brûle pas le code : on peut recommencer.
      expect(await peekOtp('peek@test.com', code, 'PASSWORD_RESET')).toEqual({ ok: true, userId: null })
      // Écran « nouveau mot de passe » : la consommation finale aboutit.
      expect(await consumeOtp('peek@test.com', code, 'PASSWORD_RESET')).toEqual({ ok: true, userId: null })
      // Et une fois consommé, plus rien.
      expect(await consumeOtp('peek@test.com', code, 'PASSWORD_RESET')).toEqual({ ok: false, reason: 'OTP_INVALID' })
    })

    it('un code ne vaut que pour son usage : vérification ≠ réinitialisation', async () => {
      const verifCode = await issueOtp('iso@test.com', null, 'EMAIL_VERIFICATION')
      const resetCode = await issueOtp('iso@test.com', null, 'PASSWORD_RESET')

      // Les deux coexistent (émettre l'un n'a pas chassé l'autre).
      // Un code n'est reconnu que sous son propre usage.
      expect(await peekOtp('iso@test.com', verifCode, 'PASSWORD_RESET')).toEqual({ ok: false, reason: 'OTP_INVALID' })
      expect(await consumeOtp('iso@test.com', resetCode, 'EMAIL_VERIFICATION')).toEqual({ ok: false, reason: 'OTP_INVALID' })
      // Chacun fonctionne sous le sien.
      expect(await consumeOtp('iso@test.com', verifCode, 'EMAIL_VERIFICATION')).toEqual({ ok: true, userId: null })
      expect(await consumeOtp('iso@test.com', resetCode, 'PASSWORD_RESET')).toEqual({ ok: true, userId: null })
    })
  })

  describe('POST /api/auth/register', () => {
    it('crée un compte LEARNER non vérifié, journalise et émet un OTP', async () => {
      const response = await registerHandler(
        jsonRequest('http://localhost/api/auth/register', {
          email: 'Nouveau@Test.com',
          password: 'MotDePasse2026!',
          fullName: 'Nouveau Compte',
        }, nextIp()),
      )
      expect(response.status).toBe(201)

      const user = await prisma.user.findUnique({ where: { email: 'nouveau@test.com' } })
      expect(user).not.toBeNull()
      expect(user!.role).toBe('LEARNER')
      expect(user!.emailVerifiedAt).toBeNull()
      expect(user!.passwordHash).not.toBe('MotDePasse2026!')

      const audits = await prisma.auditLog.findMany({ where: { targetId: user!.id } })
      expect(audits.map(a => a.action)).toEqual(['USER_REGISTERED'])

      const otps = await prisma.emailOtp.findMany({ where: { email: 'nouveau@test.com' } })
      expect(otps).toHaveLength(1)
      expect(otps[0].consumedAt).toBeNull()
    })

    it('répond un succès uniforme sur une adresse déjà utilisée, sans second compte ni OTP (anti-énumération)', async () => {
      await prisma.user.create({ data: { email: 'deja@test.com', passwordHash: await hashPassword('MotDePasse2026!') } })

      const response = await registerHandler(
        jsonRequest('http://localhost/api/auth/register', {
          email: 'deja@test.com',
          password: 'AutreMotDePasse2026!',
          fullName: 'Doublon',
        }, nextIp()),
      )

      // Même réponse que pour une vraie inscription : le code HTTP ne doit pas
      // révéler qu'un compte existe à cette adresse (finding 7 du pentest).
      expect(response.status).toBe(201)
      // Aucun second compte, et surtout aucun OTP émis : l'adresse reçoit un
      // e-mail « compte existant », pas un code de vérification.
      expect(await prisma.user.count({ where: { email: 'deja@test.com' } })).toBe(1)
      expect(await prisma.emailOtp.count({ where: { email: 'deja@test.com' } })).toBe(0)

      const audits = await prisma.auditLog.findMany({ where: { action: 'REGISTER_EMAIL_IN_USE' } })
      expect(audits).toHaveLength(1)
    })
  })

  describe('POST /api/auth/reset-password', () => {
    it('change le mot de passe, révoque les sessions et journalise', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'reset@test.com',
          passwordHash: await hashPassword('AncienMotDePasse1'),
          sessionsValidAfter: new Date(Date.now() - 86_400_000),
        },
      })
      const code = await issueOtp('reset@test.com', user.id, 'PASSWORD_RESET')

      const response = await resetPasswordHandler(
        jsonRequest('http://localhost/api/auth/reset-password', {
          email: 'reset@test.com',
          code,
          password: 'NouveauMotDePasse1',
        }, nextIp()),
      )
      expect(response.status).toBe(200)

      const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
      expect(updated.passwordHash).not.toBe(user.passwordHash)
      expect(updated.sessionsValidAfter.getTime()).toBeGreaterThan(user.sessionsValidAfter.getTime())
      expect(updated.emailVerifiedAt).not.toBeNull()

      const audits = await prisma.auditLog.findMany({ where: { targetId: user.id } })
      expect(audits.map(a => a.action)).toEqual(['PASSWORD_RESET'])
    })

    it('refuse un code invalide sans toucher au mot de passe', async () => {
      const user = await prisma.user.create({
        data: { email: 'reset2@test.com', passwordHash: await hashPassword('AncienMotDePasse1') },
      })
      const code = await issueOtp('reset2@test.com', user.id, 'PASSWORD_RESET')
      const wrong = code === '000000' ? '999999' : '000000'

      const response = await resetPasswordHandler(
        jsonRequest('http://localhost/api/auth/reset-password', {
          email: 'reset2@test.com',
          code: wrong,
          password: 'NouveauMotDePasse1',
        }, nextIp()),
      )

      expect(response.status).toBe(422)
      expect((await response.json()).error.code).toBe('OTP_INVALID')
      const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
      expect(unchanged.passwordHash).toBe(user.passwordHash)
    })
  })

  describe('Plafond de tentatives de connexion', () => {
    const PASSWORD = 'MotDePasse2026!'

    /** `authorize` du provider Credentials, tel que NextAuth l'appelle. */
    async function attempt(email: string, password: string, ip: string) {
      return authorizeCredentials(
        { email, password },
        { headers: { 'x-forwarded-for': ip }, body: {}, query: {}, method: 'POST' },
      )
    }

    async function createUser(email: string) {
      return prisma.user.create({ data: { email, passwordHash: await hashPassword(PASSWORD) } })
    }

    it('bloque après RATE_LIMITS.LOGIN.max échecs, même avec le bon mot de passe', async () => {
      const ip = nextIp()
      await createUser('brute@test.com')

      for (let i = 0; i < RATE_LIMITS.LOGIN.max; i++) {
        expect(await attempt('brute@test.com', 'MauvaisMotDePasse1', ip)).toBeNull()
      }

      await expect(attempt('brute@test.com', PASSWORD, ip)).rejects.toThrow('TOO_MANY_ATTEMPTS')
    })

    it('remet le compteur à zéro après une connexion réussie', async () => {
      const ip = nextIp()
      const user = await createUser('rattrape@test.com')

      // Quatre fautes de frappe rattrapées ne doivent pas peser sur la suite.
      for (let i = 0; i < RATE_LIMITS.LOGIN.max - 1; i++) {
        expect(await attempt('rattrape@test.com', 'MauvaisMotDePasse1', ip)).toBeNull()
      }
      const ok = await attempt('rattrape@test.com', PASSWORD, ip)
      expect(ok?.id).toBe(user.id)

      for (let i = 0; i < RATE_LIMITS.LOGIN.max; i++) {
        expect(await attempt('rattrape@test.com', 'MauvaisMotDePasse1', ip)).toBeNull()
      }
      await expect(attempt('rattrape@test.com', PASSWORD, ip)).rejects.toThrow('TOO_MANY_ATTEMPTS')
    })

    it('plafonne aussi par adresse e-mail, donc depuis une autre IP', async () => {
      const firstIp = nextIp()
      await createUser('cible@test.com')

      for (let i = 0; i < RATE_LIMITS.LOGIN.max; i++) {
        expect(await attempt('cible@test.com', 'MauvaisMotDePasse1', firstIp)).toBeNull()
      }

      // Un botnet change d'IP à chaque coup : sans compteur par e-mail, le
      // martèlement d'un compte unique passerait sous le plafond.
      await expect(attempt('cible@test.com', PASSWORD, nextIp())).rejects.toThrow('TOO_MANY_ATTEMPTS')
    })

    it('fait payer le quota à une adresse inconnue comme à une adresse réelle', async () => {
      const ip = nextIp()
      await createUser('reelle@test.com')

      // Sinon le plafond devient un oracle : « ça bloque » signifierait « ce
      // compte existe », et le balayage d'adresses resterait gratuit.
      for (let i = 0; i < RATE_LIMITS.LOGIN.max; i++) {
        expect(await attempt(`inconnue-${i}@test.com`, 'MauvaisMotDePasse1', ip)).toBeNull()
      }

      await expect(attempt('reelle@test.com', PASSWORD, ip)).rejects.toThrow('TOO_MANY_ATTEMPTS')
    })

    it('est bien la fonction câblée sur le provider NextAuth', async () => {
      // `providers[0].authorize` est le stub `() => null` de NextAuth ; la
      // fonction réellement appelée est celle passée en options. Sans ce
      // contrôle, débrancher `authorizeCredentials` ne casserait aucun test.
      const wired = (authOptions.providers[0] as any).options.authorize
      expect(wired).toBeTypeOf('function')

      const ip = nextIp()
      const req = { headers: { 'x-forwarded-for': ip } }
      for (let i = 0; i < RATE_LIMITS.LOGIN.max; i++) {
        expect(await wired({ email: 'cable@test.com', password: 'MauvaisMotDePasse1' }, req)).toBeNull()
      }
      await expect(wired({ email: 'cable@test.com', password: 'MauvaisMotDePasse1' }, req)).rejects.toThrow(
        'TOO_MANY_ATTEMPTS',
      )
    })
  })

  describe('Invalidation ciblée des sessions', () => {
    it('révoque un jeton émis avant sessionsValidAfter', () => {
      const validAfter = new Date('2026-08-01T12:00:10.000Z')
      const iatBefore = Math.floor(new Date('2026-08-01T12:00:05.000Z').getTime() / 1000)
      expect(isSessionRevoked(iatBefore, validAfter.toISOString())).toBe(true)
    })

    it('laisse passer un jeton émis dans la même seconde que la révocation', () => {
      // `iat` est en secondes entières : sans troncature, une reconnexion immédiate
      // après une réinitialisation de mot de passe serait vue comme révoquée.
      const validAfter = new Date('2026-08-01T12:00:10.500Z')
      const iatSameSecond = Math.floor(new Date('2026-08-01T12:00:10.000Z').getTime() / 1000)
      expect(isSessionRevoked(iatSameSecond, validAfter.toISOString())).toBe(false)
    })

    it('laisse passer un jeton postérieur', () => {
      const validAfter = new Date('2026-08-01T12:00:10.000Z')
      const iatAfter = Math.floor(new Date('2026-08-01T12:05:00.000Z').getTime() / 1000)
      expect(isSessionRevoked(iatAfter, validAfter.toISOString())).toBe(false)
    })
  })
})
