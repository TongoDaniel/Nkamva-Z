import { randomInt } from 'crypto'
import { db } from './db'
import { hashPassword, verifyPassword } from './password'
import { sendEmail, renderSimpleEmail } from './email'

export const OTP_TTL_MS = 10 * 60 * 1000
export const OTP_MAX_ATTEMPTS = 5

/**
 * `EmailOtp` ne porte pas de colonne « purpose » : un code vaut preuve de contrôle de
 * l'adresse, quel que soit l'usage (vérification d'email ou réinitialisation de mot de
 * passe). Émettre un nouveau code invalide donc le précédent pour cette adresse.
 */
export async function issueOtp(email: string, userId: string | null): Promise<string> {
  const normalized = email.toLowerCase()
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const codeHash = await hashPassword(code)

  await db.$transaction(async tx => {
    await tx.emailOtp.updateMany({
      where: { email: normalized, consumedAt: null },
      data: { consumedAt: new Date() },
    })
    await tx.emailOtp.create({
      data: {
        email: normalized,
        codeHash,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
        userId,
      },
    })
  })

  return code
}

export type OtpFailure = 'OTP_INVALID' | 'OTP_EXPIRED' | 'OTP_TOO_MANY_ATTEMPTS'

export async function consumeOtp(
  email: string,
  code: string,
): Promise<{ ok: true; userId: string | null } | { ok: false; reason: OtpFailure }> {
  const normalized = email.toLowerCase()
  const otp = await db.emailOtp.findFirst({
    where: { email: normalized, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  })

  if (!otp) return { ok: false, reason: 'OTP_INVALID' }
  if (otp.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'OTP_EXPIRED' }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: 'OTP_TOO_MANY_ATTEMPTS' }

  const valid = await verifyPassword(code, otp.codeHash)
  if (!valid) {
    const updated = await db.emailOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    })
    return {
      ok: false,
      reason: updated.attempts >= OTP_MAX_ATTEMPTS ? 'OTP_TOO_MANY_ATTEMPTS' : 'OTP_INVALID',
    }
  }

  // `updateMany` gardé sur `consumedAt: null` : deux requêtes concurrentes avec le bon
  // code ne peuvent pas consommer le même OTP deux fois.
  const consumed = await db.emailOtp.updateMany({
    where: { id: otp.id, consumedAt: null },
    data: { consumedAt: new Date() },
  })
  if (consumed.count === 0) return { ok: false, reason: 'OTP_INVALID' }

  return { ok: true, userId: otp.userId }
}

export async function sendOtpEmail(email: string, code: string): Promise<void> {
  const { html, text } = renderSimpleEmail({
    title: 'Votre code de vérification',
    paragraphs: ['Bonjour,', 'Voici le code à saisir pour confirmer votre adresse e-mail :'],
    highlight: code,
    footnote:
      'Ce code expire dans 10 minutes. Si vous n\'êtes pas à l\'origine de cette demande, ignorez cet e-mail : aucune action n\'a été effectuée sur votre compte.',
  })

  await sendEmail({
    to: email,
    subject: `NkamVa — votre code de vérification : ${code}`,
    html,
    text,
    tags: ['otp'],
  })
}
