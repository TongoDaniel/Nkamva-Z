// ==========================================================================
// Double authentification par application (TOTP)
// ==========================================================================
// Le SMS a été écarté comme second facteur, et c'est un choix motivé : NkamVa
// porte des portefeuilles, des moyens de paiement et des retraits, or l'échange
// de carte SIM est l'attaque qui vise précisément les comptes adossés au mobile
// money. Le SMS reste le bon canal pour **alerter** (arbitrage 24) ; il est
// mauvais pour tenir la porte.
//
// Trois propriétés structurent ce module :
//
// 1. **Le second facteur est vérifié avant l'émission de la session.** Il vit
//    dans `authorize()` de NextAuth, au même endroit que le mot de passe. Un
//    second facteur contrôlé après coup, sur une session déjà émise, est
//    décoratif : il suffit de ne pas appeler l'écran qui le demande.
// 2. **Un secret sans `twoFactorEnabledAt` ne protège rien.** L'enrôlement pose
//    le secret, mais la protection n'existe qu'une fois un premier code
//    vérifié — sinon quelqu'un qui scanne mal son QR se verrouille dehors.
// 3. **Perdre son téléphone n'enferme personne.** Dix codes de secours à usage
//    unique, montrés une seule fois. Pas de déblocage par le support : c'est
//    ainsi que tombent la plupart des comptes protégés — on n'attaque pas le
//    facteur, on raconte une histoire à quelqu'un.
//
// Le secret est **chiffré au repos** (AES-256-GCM avec `NEXTAUTH_SECRET`). Une
// fuite de la table `users` livrerait sinon de quoi générer les codes de tout
// le monde, ce qui reviendrait à n'avoir pas de second facteur du tout.
// ==========================================================================

import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto'
import * as OTPAuth from 'otpauth'
import { db } from './db'
import { audit, auditStandalone } from './audit'
import { notify, deliverSideEffects } from './notification'

export const RECOVERY_CODE_COUNT = 10
/** Fenêtre de tolérance : ±1 pas de 30 s, pour une horloge de téléphone décalée. */
const TOTP_WINDOW = 1
const ISSUER = 'NkamVa'

// --- Chiffrement du secret ---

function encryptionKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET_MISSING')
  // Dérivée et non utilisée telle quelle : `NEXTAUTH_SECRET` signe déjà les
  // jetons de session, les deux usages ne doivent pas partager la même clé.
  return scryptSync(secret, 'nkamva-2fa-v1', 32)
}

function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.')
}

function decryptSecret(stored: string): string | null {
  try {
    const [iv, tag, payload] = stored.split('.')
    if (!iv || !tag || !payload) return null
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(payload, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    // Secret illisible — clé changée, ligne corrompue. On refuse plutôt que de
    // laisser passer : un second facteur qu'on ne sait plus vérifier ne doit
    // pas devenir un second facteur qu'on ignore.
    return null
  }
}

// --- Codes de secours ---

function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code.replace(/[\s-]/g, '').toUpperCase()).digest('hex')
}

/** `A1B2-C3D4-E5F6` — lisible à voix haute, sans caractères ambigus. */
function generateRecoveryCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(12)
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length])
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`
}

// --- Enrôlement ---

export interface TwoFactorSetup {
  /** URI `otpauth://` à encoder en QR code. */
  uri: string
  /** Le secret en clair, pour saisie manuelle si le QR ne passe pas. */
  secret: string
}

/**
 * Prépare l'enrôlement : tire un secret, l'enregistre **sans activer**. La
 * protection n'existera qu'une fois un premier code vérifié — sinon quelqu'un
 * qui scanne mal son QR se retrouve verrouillé dehors.
 */
export async function beginTwoFactorSetup(userId: string): Promise<TwoFactorSetup> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, twoFactorEnabledAt: true },
  })
  if (!user) throw new Error('USER_NOT_FOUND')
  if (user.twoFactorEnabledAt) throw new Error('TWO_FACTOR_ALREADY_ENABLED')

  const secret = new OTPAuth.Secret({ size: 20 })
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  })

  await db.user.update({
    where: { id: userId },
    data: { twoFactorSecret: encryptSecret(secret.base32) },
  })

  return { uri: totp.toString(), secret: secret.base32 }
}

export interface TwoFactorEnabled {
  /** Montrés **une seule fois**. Ils ne sont stockés que hachés. */
  recoveryCodes: string[]
}

/**
 * Active la protection après vérification d'un premier code, et rend les codes
 * de secours. C'est le seul moment où ils existent en clair.
 */
export async function enableTwoFactor(userId: string, code: string): Promise<TwoFactorEnabled> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, twoFactorSecret: true, twoFactorEnabledAt: true },
  })
  if (!user) throw new Error('USER_NOT_FOUND')
  if (user.twoFactorEnabledAt) throw new Error('TWO_FACTOR_ALREADY_ENABLED')
  if (!user.twoFactorSecret) throw new Error('TWO_FACTOR_NOT_STARTED')

  const secret = decryptSecret(user.twoFactorSecret)
  if (!secret || !verifyTotp(secret, code)) throw new Error('TWO_FACTOR_INVALID_CODE')

  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode)
  const now = new Date()

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { twoFactorEnabledAt: now } })
    // Une réactivation ne doit pas laisser vivre les codes du tour précédent.
    await tx.recoveryCode.deleteMany({ where: { userId } })
    await tx.recoveryCode.createMany({
      data: codes.map((c) => ({ userId, codeHash: hashRecoveryCode(c) })),
    })
    await audit(tx, {
      actorId: userId, actorRole: 'USER',
      action: 'TWO_FACTOR_ENABLED', targetType: 'User', targetId: userId,
      meta: { recoveryCodes: codes.length },
    })
  })

  await deliverSideEffects('TWO_FACTOR_ENABLED', { type: 'User', id: userId }, () =>
    notify(userId, {
      type: 'SECURITY',
      title: 'Double authentification activée',
      body: 'Un code de votre application sera désormais demandé à chaque connexion. Conservez vos codes de secours.',
      link: '/profil',
    }),
  )

  return { recoveryCodes: codes }
}

/**
 * Désactive la protection. Exige un code valide — d'application ou de secours :
 * sans cela, une session volée suffirait à retirer le second facteur, ce qui
 * reviendrait à ne pas en avoir.
 */
export async function disableTwoFactor(userId: string, code: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, twoFactorSecret: true, twoFactorEnabledAt: true },
  })
  if (!user?.twoFactorEnabledAt) throw new Error('TWO_FACTOR_NOT_ENABLED')

  const ok = await verifySecondFactor(userId, code)
  if (!ok) throw new Error('TWO_FACTOR_INVALID_CODE')

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: null,
        twoFactorEnabledAt: null,
        // Toute session ouverte tombe : retirer un facteur de sécurité est un
        // événement qui mérite qu'on se reconnecte partout.
        sessionsValidAfter: new Date(),
      },
    })
    await tx.recoveryCode.deleteMany({ where: { userId } })
    await audit(tx, {
      actorId: userId, actorRole: 'USER',
      action: 'TWO_FACTOR_DISABLED', targetType: 'User', targetId: userId,
    })
  })

  await deliverSideEffects('TWO_FACTOR_DISABLED', { type: 'User', id: userId }, () =>
    notify(userId, {
      type: 'SECURITY',
      title: 'Double authentification désactivée',
      body: 'Si vous n\'êtes pas à l\'origine de ce changement, changez votre mot de passe immédiatement.',
      link: '/profil',
    }),
  )
}

// --- Vérification ---

function verifyTotp(secret: string, code: string): boolean {
  const cleaned = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(cleaned)) return false
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  })
  // `validate` rend le décalage en pas de temps, ou `null`. Une fenêtre de ±1
  // absorbe une horloge de téléphone légèrement dérivée.
  return totp.validate({ token: cleaned, window: TOTP_WINDOW }) !== null
}

/**
 * Vérifie un second facteur : d'abord un code d'application, sinon un code de
 * secours — qui est alors **consommé**. Un code de secours ne sert qu'une fois,
 * c'est toute sa raison d'être.
 */
export async function verifySecondFactor(userId: string, code: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { twoFactorSecret: true, twoFactorEnabledAt: true },
  })
  if (!user?.twoFactorEnabledAt || !user.twoFactorSecret) return false

  const secret = decryptSecret(user.twoFactorSecret)
  if (secret && verifyTotp(secret, code)) return true

  // `updateMany` sur le hachage **et** `usedAt: null` : la consommation et le
  // contrôle sont la même écriture, donc deux tentatives simultanées avec le
  // même code n'en valident qu'une.
  const { count } = await db.recoveryCode.updateMany({
    where: { userId, codeHash: hashRecoveryCode(code), usedAt: null },
    data: { usedAt: new Date() },
  })
  if (count === 0) return false

  const remaining = await db.recoveryCode.count({ where: { userId, usedAt: null } })
  await auditStandalone({
    actorId: userId, actorRole: 'USER',
    action: 'TWO_FACTOR_RECOVERY_CODE_USED', targetType: 'User', targetId: userId,
    meta: { remaining },
  })
  await deliverSideEffects('RECOVERY_CODE_USED', { type: 'User', id: userId }, () =>
    notify(userId, {
      type: 'SECURITY',
      title: 'Un code de secours a été utilisé',
      body: `Il vous en reste ${remaining}. Si vous n'êtes pas à l'origine de cette connexion, changez votre mot de passe.`,
      link: '/profil',
    }),
  )
  return true
}

// --- Lecture ---

export interface TwoFactorStatus {
  enabled: boolean
  enabledAt: Date | null
  /** Un enrôlement commencé mais jamais confirmé. */
  pending: boolean
  remainingRecoveryCodes: number
  /** Ce rôle doit-il obligatoirement l'activer ? */
  required: boolean
}

/**
 * Les administrateurs sont tenus d'activer la protection : un Super-admin peut
 * lever une exclusion, poser un tarif et approuver un retrait. Ils sont trois,
 * pas trois mille.
 *
 * ⚠️ L'obligation ne **bloque** l'accès que si `REQUIRE_ADMIN_2FA=1` : activer
 * la contrainte avant que les administrateurs se soient enrôlés les
 * verrouillerait dehors, y compris celui qui devrait les débloquer.
 */
export function twoFactorRequiredFor(role: string, adminRole: string | null): boolean {
  return role === 'ADMIN' || adminRole !== null
}

export function adminTwoFactorEnforced(): boolean {
  return process.env.REQUIRE_ADMIN_2FA === '1'
}

export async function getTwoFactorStatus(userId: string): Promise<TwoFactorStatus> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, adminRole: true, twoFactorSecret: true, twoFactorEnabledAt: true },
  })
  if (!user) throw new Error('USER_NOT_FOUND')

  return {
    enabled: Boolean(user.twoFactorEnabledAt),
    enabledAt: user.twoFactorEnabledAt,
    pending: Boolean(user.twoFactorSecret) && !user.twoFactorEnabledAt,
    remainingRecoveryCodes: user.twoFactorEnabledAt
      ? await db.recoveryCode.count({ where: { userId, usedAt: null } })
      : 0,
    required: twoFactorRequiredFor(user.role, user.adminRole),
  }
}

/**
 * Exige un second facteur **frais** pour pointer de l'argent vers un nouveau
 * compte. C'est la règle des banques et des plateformes d'échange, et elle
 * remplace avantageusement l'alerte SMS de l'arbitrage 24 : celle-ci prévenait
 * après coup, celle-ci empêche.
 *
 * Deux refus distincts, et la nuance compte :
 *
 * · Le compte a un second facteur → un code valide est exigé, maintenant. Se
 *   contenter de vérifier que la protection *existe* ne servirait à rien : un
 *   attaquant qui tient la session pourrait l'activer lui-même.
 * · Le compte n'en a pas → on refuse, et on demande de l'activer d'abord.
 *
 * ⚠️ La garde vit au niveau de la route et non du service, comme
 * `requireTrainer()` : c'est là qu'arrive le code, et c'est la couche qui porte
 * déjà l'authentification. Toute nouvelle voie d'écriture d'un moyen de paiement
 * devra l'appeler explicitement.
 */
export async function assertSecondFactorForPayout(userId: string, code?: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabledAt: true },
  })
  if (!user?.twoFactorEnabledAt) throw new Error('TWO_FACTOR_SETUP_REQUIRED')
  if (!code?.trim()) throw new Error('TWO_FACTOR_REQUIRED')
  if (!(await verifySecondFactor(userId, code.trim()))) throw new Error('TWO_FACTOR_INVALID_CODE')
}

/** Régénère les dix codes. Les précédents cessent de valoir immédiatement. */
export async function regenerateRecoveryCodes(userId: string, code: string): Promise<string[]> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabledAt: true },
  })
  if (!user?.twoFactorEnabledAt) throw new Error('TWO_FACTOR_NOT_ENABLED')
  if (!(await verifySecondFactor(userId, code))) throw new Error('TWO_FACTOR_INVALID_CODE')

  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode)
  await db.$transaction(async (tx) => {
    await tx.recoveryCode.deleteMany({ where: { userId } })
    await tx.recoveryCode.createMany({
      data: codes.map((c) => ({ userId, codeHash: hashRecoveryCode(c) })),
    })
    await audit(tx, {
      actorId: userId, actorRole: 'USER',
      action: 'TWO_FACTOR_RECOVERY_CODES_REGENERATED', targetType: 'User', targetId: userId,
    })
  })
  return codes
}
