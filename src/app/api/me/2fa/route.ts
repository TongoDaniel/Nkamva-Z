// Double authentification de l'utilisateur courant.
//
// Quatre gestes sur une seule route, parce qu'ils portent tous sur le même
// objet : consulter l'état, commencer l'enrôlement, l'activer, le retirer.
import { z } from 'zod'
import QRCode from 'qrcode'
import { success, error, requireAuth, parseBody, errorFromException } from '@/lib/api'
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit'
import {
  getTwoFactorStatus, beginTwoFactorSetup, enableTwoFactor, disableTwoFactor,
  regenerateRecoveryCodes,
} from '@/lib/two-factor'

const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('setup'), currentPassword: z.string().min(1).max(200) }),
  z.object({ action: z.literal('enable'), code: z.string().min(6).max(9) }),
  z.object({ action: z.literal('regenerate'), code: z.string().min(6).max(20) }),
])

const DisableSchema = z.object({ code: z.string().min(6).max(20) }).strict()

export async function GET() {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  try {
    return success(await getTwoFactorStatus(ctx.user.id))
  } catch (err) {
    return errorFromException(err)
  }
}

export async function POST(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  // Le plafond de vérification d'OTP s'applique : sans lui, six chiffres se
  // parcourent en quelques heures.
  const limit = checkRateLimit(
    getRateLimitIdentifier(ctx.user, request), 'two-factor',
    RATE_LIMITS.OTP_VERIFY.max, RATE_LIMITS.OTP_VERIFY.windowMs,
  )
  if (!limit.allowed) return error('RATE_LIMITED', 'Trop de tentatives, réessayez dans un instant', 429)

  const parsed = await parseBody(request, ActionSchema)
  if (parsed instanceof Response) return parsed

  try {
    switch (parsed.data.action) {
      case 'setup': {
        // `setup` vérifie un mot de passe : il est limité comme une connexion,
        // sinon il deviendrait, pour qui tient une session volée, un moyen de
        // deviner ce mot de passe plus vite qu'au formulaire de connexion.
        const passwordLimit = checkRateLimit(
          getRateLimitIdentifier(ctx.user, request), 'two-factor-setup',
          RATE_LIMITS.LOGIN.max, RATE_LIMITS.LOGIN.windowMs,
        )
        if (!passwordLimit.allowed) {
          return error('RATE_LIMITED', `Trop de tentatives. Réessayez dans ${passwordLimit.retryAfter} s.`, 429)
        }
        const setup = await beginTwoFactorSetup(ctx.user.id, parsed.data.currentPassword)
        // Le QR est rendu ici et non côté client : la politique de sécurité de
        // contenu du projet interdit les scripts d'origine externe, et une
        // image en `data:` évite d'en ajouter un.
        const qr = await QRCode.toDataURL(setup.uri, { margin: 1, width: 240 })
        return success({ ...setup, qr })
      }
      case 'enable':
        return success(await enableTwoFactor(ctx.user.id, parsed.data.code))
      case 'regenerate':
        return success({ recoveryCodes: await regenerateRecoveryCodes(ctx.user.id, parsed.data.code) })
    }
  } catch (err) {
    return errorFromException(err)
  }
}

export async function DELETE(request: Request) {
  const ctx = await requireAuth()
  if (ctx instanceof Response) return ctx

  const limit = checkRateLimit(
    getRateLimitIdentifier(ctx.user, request), 'two-factor',
    RATE_LIMITS.OTP_VERIFY.max, RATE_LIMITS.OTP_VERIFY.windowMs,
  )
  if (!limit.allowed) return error('RATE_LIMITED', 'Trop de tentatives, réessayez dans un instant', 429)

  const parsed = await parseBody(request, DisableSchema)
  if (parsed instanceof Response) return parsed

  try {
    await disableTwoFactor(ctx.user.id, parsed.data.code)
    return success({ disabled: true })
  } catch (err) {
    return errorFromException(err)
  }
}
