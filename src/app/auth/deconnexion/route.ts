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

  const params = new URLSearchParams()
  // Le message ne s'affiche que s'il y avait vraiment une session à clore.
  // Sans ce test, quelqu'un qui n'a jamais ouvert de session s'entendrait dire
  // que la sienne a expiré.
  if (stale.length > 0) params.set('error', 'SESSION_ENDED')
  if (callbackUrl) params.set('callbackUrl', callbackUrl)
  const query = params.toString()

  // Une `Location` relative, comme en émet déjà le middleware pour ses propres
  // renvois. `NextResponse.redirect` exigerait une URL absolue, et la seule
  // base à portée serait `request.url` — qui, sous `output: 'standalone'`, porte
  // l'adresse d'écoute du serveur et non l'hôte public. Le 13 août 2026, le
  // staging renvoyait ainsi vers `https://0.0.0.0:3000/auth/connexion` :
  // `HOSTNAME` et `PORT` du conteneur pour l'hôte, `X-Forwarded-Proto` pour le
  // schéma, et un ERR_ADDRESS_INVALID au bout. La sortie de secours était
  // elle-même une impasse — c'est-à-dire l'exact contraire de sa raison d'être.
  //
  // Le réflexe serait de bâtir l'URL sur `WEB_BASE_URL` (voir `absoluteUrl`).
  // Ce serait correct, mais superflu : une redirection vers la même origine n'a
  // pas à la nommer, et ne rien nommer ne peut pas se tromper d'environnement.
  const response = new NextResponse(null, {
    status: 307,
    headers: { Location: `/auth/connexion${query ? `?${query}` : ''}` },
  })
  for (const cookie of stale) {
    // `secure` n'est pas décoratif : le préfixe `__Secure-` est une règle du
    // navigateur, et **tout `Set-Cookie` qui le porte sans l'attribut `Secure`
    // est rejeté d'office**. Sans lui, l'effacement ne prenait pas sous HTTPS :
    // le cookie mort survivait, le middleware continuait de le juger bon, et la
    // boucle que cette route existe pour rompre se refermait
    // (ERR_TOO_MANY_REDIRECTS, constaté sur le staging le 13 août 2026).
    //
    // `curl` ne voit pas ce défaut — il n'applique pas la règle du préfixe et
    // supprime le cookie de son bac quoi qu'il arrive. Il faut un vrai
    // navigateur, ou `scripts/smoke-session-morte.ts` sur une origine HTTPS.
    //
    // Le drapeau suit le nom plutôt que l'environnement : c'est le préfixe qui
    // impose la contrainte, et lui seul dit laquelle des deux formes du cookie
    // NextAuth on est en train d'effacer.
    response.cookies.set(cookie.name, '', {
      path: '/',
      maxAge: 0,
      httpOnly: true,
      sameSite: 'lax',
      secure: cookie.name.startsWith('__Secure-'),
    })
  }

  return response
}
