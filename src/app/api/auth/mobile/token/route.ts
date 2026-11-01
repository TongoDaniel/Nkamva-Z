import { z } from 'zod'
import { success, error, parseBody } from '@/lib/api'
import { authorizeCredentials } from '@/lib/auth'
import { issueMobileToken, MOBILE_TOKEN_MAX_AGE } from '@/lib/mobile-auth'

const schema = z.object({
  email: z.string().email('Adresse email invalide').max(254),
  password: z.string().min(1).max(512),
  totp: z.string().max(16).optional(),
})

/**
 * Les refus de `authorizeCredentials`, avec les mêmes mots que l'écran de
 * connexion du site. `TWO_FACTOR_REQUIRED` n'est pas un échec : l'app redemande
 * avec le code, comme le formulaire web.
 */
const REFUSALS: Record<string, { status: number; message: string }> = {
  TOO_MANY_ATTEMPTS: { status: 429, message: 'Trop de tentatives. Réessayez dans une minute.' },
  ACCOUNT_SUSPENDED: { status: 403, message: 'Ce compte est suspendu.' },
  TWO_FACTOR_REQUIRED: { status: 401, message: 'Saisissez le code de votre application d’authentification.' },
  TWO_FACTOR_INVALID: { status: 401, message: 'Code de vérification incorrect.' },
  TWO_FACTOR_ENROLLMENT_REQUIRED: { status: 403, message: 'Activez la double authentification depuis le site avant de vous connecter.' },
}

/**
 * Connexion de l'application mobile : renvoie un jeton porteur
 * (`docs/application-mobile.md` § 2).
 *
 * Passe par `authorizeCredentials`, la fonction du formulaire web : plafonds
 * anti-force brute, compte suspendu ou supprimé, second facteur. Aucune règle
 * de connexion n'est réécrite ici.
 */
export async function POST(request: Request) {
  const parsed = await parseBody(request, schema)
  if (parsed instanceof Response) return parsed

  let user: Record<string, unknown> | null
  try {
    user = await authorizeCredentials(parsed.data, { headers: Object.fromEntries(request.headers) })
  } catch (err) {
    const code = err instanceof Error ? err.message : ''
    const refusal = REFUSALS[code]
    if (refusal) return error(code, refusal.message, refusal.status)
    throw err
  }
  if (!user) return error('INVALID_CREDENTIALS', 'Adresse e-mail ou mot de passe incorrect.', 401)

  // L'app est celle de l'apprenant et du formateur. Le back-office reste sur
  // le web : un compte d'administration n'y a rien à faire (arbitrage 87).
  if (user.role === 'ADMIN') {
    return error('ADMIN_NOT_ON_MOBILE', 'Les comptes d’administration se connectent sur le site.', 403)
  }

  const token = await issueMobileToken(user)
  return success({
    token,
    expiresInSeconds: MOBILE_TOKEN_MAX_AGE,
    user: { id: user.id, email: user.email, role: user.role, trainerId: user.trainerId },
  })
}
