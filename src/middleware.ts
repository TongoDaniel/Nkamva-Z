import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { isSessionRevoked } from '@/lib/session-validity'

/** Préfixes de pages qui exigent une session valide. */
const PROTECTED_PREFIXES = [
  '/mon-compte',
  '/accueil',
  '/achat',
  '/profil',
  '/candidature',
  '/mes-achats',
  '/mes-ressources',
  '/mes-litiges',
  '/mes-lives',
  '/messagerie',
  '/notifications',
  '/favoris',
  '/formateur',
  '/admin',
]

/** Préfixes réservés aux comptes ADMIN. */
const ADMIN_PREFIXES = ['/admin']

/** Pages d'authentification : inaccessibles quand on est déjà connecté. */
const AUTH_PAGES = [
  '/auth/connexion',
  '/auth/inscription',
  '/auth/mot-de-passe-oublie',
  '/auth/verifier-code',
  '/auth/nouveau-mot-de-passe',
]

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production',
  })

  // Même règle d'invalidation ciblée que le callback session de `auth.ts` :
  // sur `issuedAt`, figé à la connexion, et non sur `iat` que NextAuth réémet
  // à chaque requête — la comparaison ne se déclencherait jamais.
  const issuedAt = (token?.issuedAt as number | undefined) ?? (token?.iat as number | undefined)
  const authenticated =
    !!token && !isSessionRevoked(issuedAt, token.sessionsValidAfter as string | undefined)

  // Vers l'accueil de l'espace connecté, pas vers les réglages : quelqu'un qui
  // rouvre la page de connexion en étant déjà connecté veut reprendre son
  // parcours. C'est aussi la valeur par défaut de `callbackUrl` du formulaire.
  if (authenticated && AUTH_PAGES.some(p => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.redirect(new URL('/accueil', request.url))
  }

  const isProtected = PROTECTED_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))
  if (!isProtected) return NextResponse.next()

  if (!authenticated) {
    const url = new URL('/auth/connexion', request.url)
    url.searchParams.set('callbackUrl', `${pathname}${search}`)
    return NextResponse.redirect(url)
  }

  if (ADMIN_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`)) && token.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/accueil?erreur=acces-refuse', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/mon-compte/:path*',
    '/accueil/:path*',
    '/achat/:path*',
    '/profil/:path*',
    '/candidature/:path*',
    '/mes-achats/:path*',
    '/mes-ressources/:path*',
    '/mes-litiges/:path*',
    '/mes-lives/:path*',
    '/messagerie/:path*',
    '/notifications/:path*',
    '/favoris/:path*',
    '/formateur/:path*',
    '/admin/:path*',
    '/auth/:path*',
  ],
}
