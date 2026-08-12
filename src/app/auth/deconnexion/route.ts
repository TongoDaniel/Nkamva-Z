import { NextResponse, type NextRequest } from 'next/server'

/**
 * Sortie de secours des gardes serveur : efface le cookie de session, puis
 * renvoie vers la connexion.
 *
 * Motif — le middleware et les gardes de layout ne jugent pas sur les mêmes
 * données. Le middleware ne voit que le JWT (il tourne sur le runtime Edge, il
 * n'a pas la base) ; le callback `session` de `auth.ts`, lui, relit l'utilisateur
 * au-delà de cinq minutes de jeton et rend une session vide s'il est suspendu,
 * supprimé ou introuvable. Un compte suspendu en cours de session porte donc un
 * cookie que le middleware juge bon et que le layout juge mort :
 *
 *   /accueil          → middleware : jeton valide, on passe
 *   layout (app)      → session vide, redirection vers la connexion
 *   /auth/connexion   → middleware : jeton valide, retour vers /accueil
 *
 * ...soit une boucle infinie (ERR_TOO_MANY_REDIRECTS) dont l'utilisateur ne
 * peut pas sortir : la page qui lui permettrait de se reconnecter est
 * précisément celle dont on le chasse. Passer par ici retire le cookie, ce qui
 * met les deux autorités d'accord et rompt la boucle à sa cause.
 *
 * Une garde serveur ne doit donc JAMAIS renvoyer vers `/auth/connexion`
 * directement : toujours vers cette route.
 */

/** Préfixes de cookie de session NextAuth v4 : en clair, et en `__Secure-` sous HTTPS. */
const SESSION_COOKIE_PREFIXES = ['next-auth.session-token', '__Secure-next-auth.session-token']

/**
 * Ne renvoie la destination demandée que si c'est un chemin interne. Un
 * `callbackUrl` arrive de l'URL, donc de n'importe qui : `//evil.com` est une
 * URL absolue pour le navigateur et ferait de cette route un tremplin.
 */
function safeCallbackUrl(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null
  return raw
}

export async function GET(request: NextRequest) {
  const callbackUrl = safeCallbackUrl(request.nextUrl.searchParams.get('callbackUrl'))

  // Au-delà de 4 096 octets, NextAuth découpe le cookie en `…session-token.0`,
  // `.1`, etc. Balayer les cookies présents les emporte tous, sans avoir à
  // deviner combien il y en a.
  const stale = request.cookies
    .getAll()
    .filter(c => SESSION_COOKIE_PREFIXES.some(p => c.name === p || c.name.startsWith(`${p}.`)))

  const target = new URL('/auth/connexion', request.url)
  // Le message ne s'affiche que s'il y avait vraiment une session à clore.
  // Sans ce test, quelqu'un qui n'a jamais ouvert de session s'entendrait dire
  // que la sienne a expiré.
  if (stale.length > 0) target.searchParams.set('error', 'SESSION_ENDED')
  if (callbackUrl) target.searchParams.set('callbackUrl', callbackUrl)

  const response = NextResponse.redirect(target)
  for (const cookie of stale) {
    response.cookies.set(cookie.name, '', { path: '/', maxAge: 0 })
  }

  return response
}
