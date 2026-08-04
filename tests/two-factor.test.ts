// ==========================================================================
// Double authentification par TOTP
// ==========================================================================
// Le test qui compte est le dernier : le second facteur doit être vérifié
// **avant** l'émission de la session. Contrôlé après coup, sur un écran dédié,
// il suffirait de ne pas appeler cet écran.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as OTPAuth from 'otpauth'
import { prisma, cleanDatabase } from './setup'
import {
  beginTwoFactorSetup, enableTwoFactor, disableTwoFactor, verifySecondFactor,
  getTwoFactorStatus, regenerateRecoveryCodes, twoFactorRequiredFor,
  assertSecondFactorForPayout, RECOVERY_CODE_COUNT,
} from '@/lib/two-factor'
import { authorizeCredentials } from '@/lib/auth'
import { hashPassword } from '@/lib/password'

/** Le code qu'afficherait l'application de l'utilisateur, à cet instant. */
function currentCode(secret: string): string {
  return new OTPAuth.TOTP({
    issuer: 'NkamVa', algorithm: 'SHA1', digits: 6, period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  }).generate()
}

describe('Double authentification', () => {
  beforeEach(async () => {
    await cleanDatabase()
    // Le secret TOTP est chiffré au repos avec une clé dérivée de celle-ci.
    process.env.NEXTAUTH_SECRET = 'secret-de-test-suffisamment-long-0123456789'
  })
  afterEach(async () => { await cleanDatabase() })

  async function user(email = 'membre@test.com', password = 'MotDePasse1') {
    return prisma.user.create({
      data: { email, role: 'LEARNER', passwordHash: await hashPassword(password) },
    })
  }

  /** Enrôle complètement, et rend le secret et les codes de secours. */
  async function enroll(userId: string) {
    const { secret } = await beginTwoFactorSetup(userId)
    const { recoveryCodes } = await enableTwoFactor(userId, currentCode(secret))
    return { secret, recoveryCodes }
  }

  // --- Enrôlement ---

  it('un secret sans activation ne protège rien', async () => {
    const u = await user()
    await beginTwoFactorSetup(u.id)

    const status = await getTwoFactorStatus(u.id)
    expect(status.pending).toBe(true)
    expect(status.enabled).toBe(false)
    // Sinon quelqu'un qui scanne mal son QR se verrouillerait dehors.
    expect(await verifySecondFactor(u.id, '000000')).toBe(false)
  })

  it('l\'activation exige un premier code valide, et rend dix codes de secours', async () => {
    const u = await user()
    const { secret } = await beginTwoFactorSetup(u.id)

    await expect(enableTwoFactor(u.id, '000000')).rejects.toThrow('TWO_FACTOR_INVALID_CODE')

    const { recoveryCodes } = await enableTwoFactor(u.id, currentCode(secret))
    expect(recoveryCodes).toHaveLength(RECOVERY_CODE_COUNT)
    expect(new Set(recoveryCodes).size).toBe(RECOVERY_CODE_COUNT)

    const status = await getTwoFactorStatus(u.id)
    expect(status.enabled).toBe(true)
    expect(status.remainingRecoveryCodes).toBe(RECOVERY_CODE_COUNT)
  })

  it('le secret n\'est pas stocké en clair', async () => {
    const u = await user()
    const { secret } = await beginTwoFactorSetup(u.id)

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: u.id }, select: { twoFactorSecret: true },
    })
    // Une fuite de la table livrerait sinon de quoi générer les codes de tout
    // le monde — autant n'avoir pas de second facteur.
    expect(stored.twoFactorSecret).not.toContain(secret)
    expect(stored.twoFactorSecret).toMatch(/^[\w+/=]+\.[\w+/=]+\.[\w+/=]+$/)
  })

  // --- Vérification ---

  it('accepte le code de l\'application, refuse un autre', async () => {
    const u = await user()
    const { secret } = await enroll(u.id)

    expect(await verifySecondFactor(u.id, currentCode(secret))).toBe(true)
    expect(await verifySecondFactor(u.id, '000000')).toBe(false)
    expect(await verifySecondFactor(u.id, 'pas-un-code')).toBe(false)
  })

  it('un code de secours ne sert qu\'une fois', async () => {
    const u = await user()
    const { recoveryCodes } = await enroll(u.id)
    const code = recoveryCodes[0]

    expect(await verifySecondFactor(u.id, code)).toBe(true)
    expect(await verifySecondFactor(u.id, code)).toBe(false)

    expect((await getTwoFactorStatus(u.id)).remainingRecoveryCodes).toBe(RECOVERY_CODE_COUNT - 1)
  })

  it('deux usages simultanés du même code n\'en valident qu\'un', async () => {
    const u = await user()
    const { recoveryCodes } = await enroll(u.id)

    // Consommation et contrôle sont la même écriture : c'est ce qui rend la
    // course impossible.
    const results = await Promise.all([
      verifySecondFactor(u.id, recoveryCodes[0]),
      verifySecondFactor(u.id, recoveryCodes[0]),
    ])
    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it('le code de secours d\'un autre compte ne vaut rien', async () => {
    const a = await user('a@test.com')
    const b = await user('b@test.com')
    const { recoveryCodes } = await enroll(a.id)
    await enroll(b.id)

    expect(await verifySecondFactor(b.id, recoveryCodes[0])).toBe(false)
  })

  // --- Désactivation ---

  it('désactiver exige un code : une session volée ne suffit pas', async () => {
    const u = await user()
    const { secret } = await enroll(u.id)

    await expect(disableTwoFactor(u.id, '000000')).rejects.toThrow('TWO_FACTOR_INVALID_CODE')
    expect((await getTwoFactorStatus(u.id)).enabled).toBe(true)

    await disableTwoFactor(u.id, currentCode(secret))
    const status = await getTwoFactorStatus(u.id)
    expect(status.enabled).toBe(false)
    expect(status.remainingRecoveryCodes).toBe(0)
    // Les codes de secours tombent avec le facteur qu'ils secouraient.
    expect(await prisma.recoveryCode.count({ where: { userId: u.id } })).toBe(0)
  })

  it('régénérer invalide la série précédente', async () => {
    const u = await user()
    const { secret, recoveryCodes } = await enroll(u.id)

    const fresh = await regenerateRecoveryCodes(u.id, currentCode(secret))
    expect(fresh).toHaveLength(RECOVERY_CODE_COUNT)
    expect(await verifySecondFactor(u.id, recoveryCodes[0])).toBe(false)
    expect(await verifySecondFactor(u.id, fresh[0])).toBe(true)
  })

  // --- Le test qui compte : la session n'est émise qu'après les deux facteurs ---

  it('la session n\'est jamais émise sans le second facteur', async () => {
    const u = await user('login@test.com', 'MotDePasse1')
    const { secret } = await enroll(u.id)
    const creds = { email: 'login@test.com', password: 'MotDePasse1' }

    // Mot de passe bon, pas de code : on ne rend pas d'utilisateur, on demande.
    await expect(authorizeCredentials(creds)).rejects.toThrow('TWO_FACTOR_REQUIRED')

    // Mot de passe bon, mauvais code : refusé.
    await expect(authorizeCredentials({ ...creds, totp: '000000' }))
      .rejects.toThrow('TWO_FACTOR_INVALID')

    // Les deux : la session peut naître.
    const session = await authorizeCredentials({ ...creds, totp: currentCode(secret) })
    expect(session).toMatchObject({ id: u.id, email: 'login@test.com' })
  })

  it('un compte sans double authentification se connecte comme avant', async () => {
    await user('simple@test.com', 'MotDePasse1')
    const session = await authorizeCredentials({ email: 'simple@test.com', password: 'MotDePasse1' })
    expect(session).toMatchObject({ email: 'simple@test.com' })
  })

  it('un code de secours ouvre aussi la session', async () => {
    const u = await user('secours@test.com', 'MotDePasse1')
    const { recoveryCodes } = await enroll(u.id)

    const session = await authorizeCredentials({
      email: 'secours@test.com', password: 'MotDePasse1', totp: recoveryCodes[0],
    })
    expect(session).toMatchObject({ id: u.id })
  })

  // --- Verrou sur les moyens de paiement ---
  //
  // Ce verrou remplace l'alerte SMS de l'arbitrage 24, qui prévenait après coup
  // qu'un RIB avait changé. Il empêche au lieu de prévenir.

  it('pointer de l\'argent vers un nouveau compte exige un second facteur frais', async () => {
    const u = await user('rib@test.com')
    const { secret } = await enroll(u.id)

    // Sans code : refusé, même avec une session parfaitement valide.
    await expect(assertSecondFactorForPayout(u.id)).rejects.toThrow('TWO_FACTOR_REQUIRED')
    await expect(assertSecondFactorForPayout(u.id, '000000'))
      .rejects.toThrow('TWO_FACTOR_INVALID_CODE')

    await expect(assertSecondFactorForPayout(u.id, currentCode(secret))).resolves.toBeUndefined()
  })

  it('sans double authentification, aucun moyen de paiement ne s\'enregistre', async () => {
    const u = await user('sans2fa@test.com')

    // Se contenter de vérifier que la protection existe ne suffirait pas : un
    // attaquant qui tient la session pourrait l'activer lui-même. C'est
    // pourquoi le refus porte ici sur l'absence, et le contrôle sur un code.
    await expect(assertSecondFactorForPayout(u.id, '123456'))
      .rejects.toThrow('TWO_FACTOR_SETUP_REQUIRED')
  })

  it('un code de secours vaut aussi pour le moyen de paiement', async () => {
    const u = await user('secours-rib@test.com')
    const { recoveryCodes } = await enroll(u.id)
    await expect(assertSecondFactorForPayout(u.id, recoveryCodes[0])).resolves.toBeUndefined()
  })

  // --- Rôles ---

  it('la protection est requise pour les rôles d\'administration', () => {
    expect(twoFactorRequiredFor('ADMIN', 'SUPER_ADMIN')).toBe(true)
    expect(twoFactorRequiredFor('ADMIN', 'FINANCES')).toBe(true)
    expect(twoFactorRequiredFor('TRAINER', null)).toBe(false)
    expect(twoFactorRequiredFor('LEARNER', null)).toBe(false)
  })

  it('l\'obligation ne bloque que si elle est explicitement activée', async () => {
    await prisma.user.create({
      data: {
        email: 'admin@test.com', role: 'ADMIN', adminRole: 'SUPER_ADMIN',
        passwordHash: await hashPassword('MotDePasse1'),
      },
    })
    const creds = { email: 'admin@test.com', password: 'MotDePasse1' }

    // Par défaut, l'administrateur se connecte : activer la contrainte avant
    // que les administrateurs se soient enrôlés les verrouillerait dehors.
    expect(await authorizeCredentials(creds)).toMatchObject({ email: 'admin@test.com' })

    process.env.REQUIRE_ADMIN_2FA = '1'
    try {
      await expect(authorizeCredentials(creds)).rejects.toThrow('TWO_FACTOR_ENROLLMENT_REQUIRED')
    } finally {
      process.env.REQUIRE_ADMIN_2FA = ''
    }
  })
})
