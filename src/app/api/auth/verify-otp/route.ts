import { z } from 'zod'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { success, error, parseBody } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import { consumeOtp, peekOtp } from '@/lib/otp'
import { otpFailureResponse } from '../otp-errors'

const schema = z.object({
  email: z.string().email('Adresse email invalide').max(254),
  code: z.string().regex(/^\d{6}$/, 'Code à 6 chiffres attendu'),
  // Même usage que celui porté par l'écran. Par défaut : vérification d'adresse.
  purpose: z.enum(['EMAIL_VERIFICATION', 'PASSWORD_RESET']).default('EMAIL_VERIFICATION'),
})

/**
 * Vérifie un code. Deux comportements selon l'usage :
 *
 *   · EMAIL_VERIFICATION — écran unique : on **consomme** le code et on marque
 *     l'adresse vérifiée.
 *   · PASSWORD_RESET — parcours à deux écrans : on **ne consomme PAS** ici (on
 *     se contente de valider), car l'écran suivant appellera `reset-password`,
 *     qui consomme le code en posant le nouveau mot de passe. Consommer aux deux
 *     endroits brûlait le code et faisait échouer toute réinitialisation.
 */
export async function POST(request: Request) {
  const parsed = await parseBody(request, schema)
  if (parsed instanceof Response) return parsed
  const email = parsed.data.email.toLowerCase()
  const purpose = parsed.data.purpose

  const identifier = `${getRateLimitIdentifier(null, request)}:${email}`
  const limit = checkRateLimit(identifier, 'OTP_VERIFY', RATE_LIMITS.OTP_VERIFY.max, RATE_LIMITS.OTP_VERIFY.windowMs)
  if (!limit.allowed) {
    return error('RATE_LIMITED', `Trop de tentatives. Réessayez dans ${limit.retryAfter} secondes.`, 429)
  }

  const result =
    purpose === 'PASSWORD_RESET'
      ? await peekOtp(email, parsed.data.code, purpose)
      : await consumeOtp(email, parsed.data.code, purpose)
  if (!result.ok) return otpFailureResponse(result.reason)

  // La réinitialisation ne vérifie pas l'adresse : elle prouve seulement le
  // contrôle de la boîte le temps de poser un mot de passe. Le marquage
  // emailVerifiedAt reste réservé au parcours de vérification.
  if (purpose === 'EMAIL_VERIFICATION') {
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, emailVerifiedAt: true, deletedAt: true },
    })
    if (!user || user.deletedAt) return error('USER_NOT_FOUND', 'Compte introuvable', 404)

    if (!user.emailVerifiedAt) {
      await db.$transaction(async tx => {
        await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } })
        await audit(tx, {
          actorId: user.id,
          actorRole: 'LEARNER',
          action: 'EMAIL_VERIFIED',
          targetType: 'User',
          targetId: user.id,
          meta: { email },
        })
      })
    }
  }

  return success({ verified: true })
}
