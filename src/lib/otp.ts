// ==========================================================================
// Lot 0 — Codes à usage unique (EmailOtp) : émission, vérification, consommation
// ==========================================================================
// Le modèle EmailOtp du schéma ne porte pas de champ `purpose`. Un seul code
// vit donc à la fois par adresse : émettre un nouveau code invalide les
// précédents. L'usage (vérification d'e-mail ou réinitialisation) est décidé
// par la route appelante, pas par la donnée — voir README des routes /api/auth.
// ==========================================================================

import { db } from './db'
import { hashPassword, verifyPassword } from './password'
import { sendEmail } from './email'
import { auditStandalone } from './audit'

export const OTP_TTL_SECONDS = 600 // 10 minutes, comme annoncé dans la maquette
export const OTP_MAX_ATTEMPTS = 5

function generateCode(): string {
  // crypto.getRandomValues évite le biais et la prévisibilité de Math.random.
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return String(buf[0] % 1_000_000).padStart(6, '0')
}

/**
 * Émet un code pour `email` et l'envoie. Invalide les codes actifs précédents.
 * Ne révèle jamais si le compte existe : l'appelant retourne toujours 200.
 */
export async function issueOtp(email: string, userId: string | null, subject: string, intro: string): Promise<void> {
  const normalized = email.toLowerCase()
  const code = generateCode()
  const codeHash = await hashPassword(code)

  await db.$transaction(async (tx) => {
    // Un seul code vivant par adresse.
    await tx.emailOtp.updateMany({
      where: { email: normalized, consumedAt: null },
      data: { consumedAt: new Date() },
    })
    await tx.emailOtp.create({
      data: {
        email: normalized,
        codeHash,
        expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
        userId,
      },
    })
  })

  await sendEmail({
    to: normalized,
    subject,
    html: `<p>${intro}</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>Ce code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>`,
    text: `${intro}\n\nCode : ${code}\n\nCe code expire dans 10 minutes.`,
    tags: ['otp'],
  })
}

export type OtpFailure = 'OTP_NOT_FOUND' | 'OTP_EXPIRED' | 'OTP_TOO_MANY_ATTEMPTS' | 'OTP_INVALID'

export const OTP_ERROR_MESSAGES: Record<OtpFailure, string> = {
  OTP_NOT_FOUND: "Aucun code en attente pour cette adresse. Demandez-en un nouveau.",
  OTP_EXPIRED: 'Ce code a expiré. Demandez-en un nouveau.',
  OTP_TOO_MANY_ATTEMPTS: 'Trop de tentatives. Demandez un nouveau code.',
  OTP_INVALID: 'Code incorrect.',
}

export interface OtpCheckResult {
  ok: boolean
  reason?: OtpFailure
  otpId?: string
  userId?: string | null
}

/**
 * Vérifie un code sans le consommer. Chaque échec incrémente `attempts` ; au
 * delà de OTP_MAX_ATTEMPTS le code est brûlé, pour borner le bruteforce même
 * si le rate limit par IP est contourné.
 */
export async function checkOtp(email: string, code: string): Promise<OtpCheckResult> {
  const normalized = email.toLowerCase()
  const otp = await db.emailOtp.findFirst({
    where: { email: normalized, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  })

  if (!otp) return { ok: false, reason: 'OTP_NOT_FOUND' }
  if (otp.expiresAt < new Date()) return { ok: false, reason: 'OTP_EXPIRED' }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: 'OTP_TOO_MANY_ATTEMPTS' }

  const valid = await verifyPassword(code, otp.codeHash)
  if (!valid) {
    const updated = await db.emailOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    })
    if (updated.attempts >= OTP_MAX_ATTEMPTS) {
      await db.emailOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } })
      await auditStandalone({
        actorId: otp.userId, actorRole: 'SYSTEM',
        action: 'OTP_BURNED_TOO_MANY_ATTEMPTS', targetType: 'EmailOtp', targetId: otp.id,
      })
      return { ok: false, reason: 'OTP_TOO_MANY_ATTEMPTS' }
    }
    return { ok: false, reason: 'OTP_INVALID' }
  }

  return { ok: true, otpId: otp.id, userId: otp.userId }
}

/**
 * Consomme le code : `updateMany` gardé sur `consumedAt: null` pour que deux
 * requêtes concurrentes ne puissent pas l'utiliser deux fois.
 */
export async function consumeOtp(otpId: string): Promise<boolean> {
  const { count } = await db.emailOtp.updateMany({
    where: { id: otpId, consumedAt: null },
    data: { consumedAt: new Date() },
  })
  return count === 1
}
