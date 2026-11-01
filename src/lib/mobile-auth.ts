import { encode, decode, type JWT } from 'next-auth/jwt'
import type { Session } from 'next-auth'
import { headers } from 'next/headers'
import { authOptions } from './auth'

/**
 * Jeton porteur de l'application mobile.
 *
 * Une app native n'a pas de cookie fiable : elle envoie
 * `Authorization: Bearer <jeton>`. Le jeton est **le même objet** que le cookie
 * NextAuth — un JWT chiffré avec `NEXTAUTH_SECRET`, garni par le callback `jwt`
 * et relu par le callback `session` de `auth.ts`. Rien n'est réécrit ici : le
 * rafraîchissement du rôle, la coupure d'un compte suspendu ou supprimé et la
 * révocation par `sessionsValidAfter` s'appliquent à l'app exactement comme au
 * site. Un deuxième jeu de règles finirait par diverger du premier.
 */

/** Même durée que la session du site (`authOptions.session.maxAge`). */
export const MOBILE_TOKEN_MAX_AGE = authOptions.session?.maxAge ?? 30 * 24 * 60 * 60

const BEARER = /^Bearer\s+(\S+)$/i

function requireSecret(): string {
  // Échec fermé, comme `auth.ts` et le middleware : sans secret, aucun jeton
  // n'est émis ni accepté.
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('NO_SECRET')
  return secret
}

/**
 * Émet le jeton d'un utilisateur que `authorizeCredentials` vient d'accepter.
 * `user` est son retour tel quel.
 */
export async function issueMobileToken(user: Record<string, unknown>): Promise<string> {
  const secret = requireSecret()
  const token = await authOptions.callbacks!.jwt!({
    token: { sub: user.id as string, email: user.email as string },
    user: user as never,
    account: null,
    trigger: 'signIn',
  } as never)
  return encode({ token: token as JWT, secret, maxAge: MOBILE_TOKEN_MAX_AGE })
}

/**
 * Le jeton porteur de la requête en cours, ou `null` s'il n'y en a pas.
 * Un en-tête `Authorization` mal formé compte comme une chaîne vide : il ne
 * doit pas faire retomber sur le cookie.
 */
export async function readBearerToken(): Promise<string | null> {
  const value = (await headers()).get('authorization')
  if (!value) return null
  return BEARER.exec(value.trim())?.[1] ?? ''
}

/**
 * L'utilisateur du jeton, passé par le callback `session` de NextAuth, ou
 * `null` si le jeton est illisible, expiré, révoqué ou si le compte est coupé.
 */
export async function sessionUserFromMobileToken(raw: string): Promise<Session['user'] | null> {
  if (!raw) return null
  let token: JWT | null
  try {
    token = await decode({ token: raw, secret: requireSecret() })
  } catch {
    return null
  }
  if (!token?.userId) return null
  const session = await authOptions.callbacks!.session!({
    session: { user: { email: token.email ?? null }, expires: '' },
    token,
  } as never) as Session
  return session?.user?.id ? session.user : null
}
