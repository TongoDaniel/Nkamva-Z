import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { isSessionRevoked } from '@/lib/session-validity'
import { safeCallbackUrl } from '@/lib/callback-url'

/** Préfixes de pages qui exigent une session valide. */
const PROTECTED_PREFIXES = [
  '/mon-compte',
  '/accueil',
  '/achat',
  // Jumeaux connectés du catalogue public : ils ne rendent la coquille
  // applicative que parce qu'une session existe, donc ils l'exigent.
  '/catalogue',
  '/profil',
  '/candidature',
  '/adhesion',
  '/mes-achats',
  '/mes-communautes',
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

/**
 * Préfixes INTERDITS aux comptes ADMIN — la réciproque de la ligne précédente.
 *
 * Un administrateur n'est qu'un administrateur : il n'achète pas, n'adhère à
 * rien et ne candidate pas. Ce n'est pas du confort d'affichage, c'est une
 * règle de conflit d'intérêts, expliquée dans `src/lib/roles.ts`.
 *
 * Cette liste ferme les PAGES. Elle ne suffit pas : les actes économiques sont
 * refusés dans les services (`purchases.ts`, `memberships.ts`, `invitations.ts`,
 * `trainer-applications.ts`), là où passe forcément tout appelant — y compris
 * une requête directe à l'API, qui ne traverse pas ce fichier.
 */
const NON_ADMIN_PREFIXES = [
  '/accueil', '/catalogue', '/achat', '/adhesion', '/mon-compte', '/profil',
  '/mes-achats', '/mes-ressources', '/mes-litiges', '/mes-lives', '/mes-communautes',
  '/messagerie', '/notifications', '/favoris',
  '/formateur', '/devenir-formateur', '/candidature',
]

/** Où atterrit chaque rôle quand aucune destination n'est demandée. */
function homeFor(role: unknown): string {
  return role === 'ADMIN' ? '/admin' : '/accueil'
}

/** Pages d'authentification : inaccessibles quand on est déjà connecté. */
const AUTH_PAGES = [
  '/auth/connexion',
  '/auth/inscription',
  '/auth/mot-de-passe-oublie',
  '/auth/verifier-code',
  '/auth/nouveau-mot-de-passe',
]

/**
 * Chemins où s'appliquent les gardes de session ci-dessous. Le `matcher` couvre
 * désormais tout le site (pour le filtre d'octets de contrôle) : cette liste
 * reprend l'ancien périmètre, et toute page hors de celle-ci sort aussitôt après
 * le filtre. Un ajout ici vaut un ajout à l'ancien `matcher`.
 */
const GUARDED_PREFIXES = [
  '/mon-compte', '/accueil', '/achat', '/adhesion', '/mes-communautes',
  '/devenir-formateur', '/catalogue', '/profil', '/candidature', '/mes-achats',
  '/mes-ressources', '/mes-litiges', '/mes-lives', '/messagerie', '/notifications',
  '/favoris', '/formateur', '/admin', '/auth',
]

/**
 * Octet nul n'importe où dans l'URL, ou caractère de contrôle dans le chemin.
 * PostgreSQL refuse l'octet nul dans un texte : un slug ou un identifiant qui
 * en porte un fait lever Prisma avant le `try` de la route, d'où un 500 vide
 * (rapport de test d'intrusion, § 3.7). Aucune URL légitime n'en contient.
 */
const NUL_ANYWHERE = /%00|\u0000/i
const CONTROL_IN_PATH = /%[01][0-9a-f]|%7f|[\u0000-\u001f\u007f]/i

export function hasForbiddenUrlBytes(pathname: string, search: string): boolean {
  return NUL_ANYWHERE.test(pathname) || NUL_ANYWHERE.test(search) || CONTROL_IN_PATH.test(pathname)
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (hasForbiddenUrlBytes(pathname, search)) {
    return pathname.startsWith('/api/')
      ? NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Requête invalide' } }, { status: 400 })
      : new NextResponse('Requête invalide', { status: 400 })
  }

  if (!GUARDED_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next()
  }

  // Aucun secret de repli. Le repli en dur d'autrefois
  // ('nkamva-dev-secret-change-in-production', versionné dans le dépôt)
  // permettait, sur tout déploiement où NEXTAUTH_SECRET manquait, de forger
  // n'importe quelle session — rôle ADMIN compris — le jeton étant alors signé
  // avec une valeur publique. Sans secret, on ne tente même pas de lire le
  // jeton (getToken l'exige) : tout le monde est traité comme anonyme. Les
  // pages publiques restent servies, les pages protégées renvoient à la
  // connexion, et aucune session ne peut être forgée. Échec fermé, jamais
  // ouvert. `auth.ts` applique la même règle côté serveur.
  const secret = process.env.NEXTAUTH_SECRET
  const token = secret ? await getToken({ req: request, secret }) : null

  // Même règle d'invalidation ciblée que le callback session de `auth.ts` :
  // sur `issuedAt`, figé à la connexion, et non sur `iat` que NextAuth réémet
  // à chaque requête — la comparaison ne se déclencherait jamais.
  const issuedAt = (token?.issuedAt as number | undefined) ?? (token?.iat as number | undefined)
  const authenticated =
    !!token && !isSessionRevoked(issuedAt, token.sessionsValidAfter as string | undefined)

  // Sortie de secours des gardes serveur : elle doit rester atteignable AVEC une
  // session, puisque c'est justement le cas où elle sert. La rediriger — en
  // l'ajoutant à `AUTH_PAGES`, ou en y mettant `/auth` comme préfixe large —
  // recréerait la boucle qu'elle existe pour rompre. Le motif est détaillé dans
  // `src/app/auth/deconnexion/route.ts`.
  if (pathname === '/auth/deconnexion') return NextResponse.next()

  // Vers l'accueil de l'espace connecté, pas vers les réglages : quelqu'un qui
  // rouvre la page de connexion en étant déjà connecté veut reprendre son
  // parcours. C'est aussi la valeur par défaut de `callbackUrl` du formulaire.
  //
  // `homeFor` plutôt que `/accueil` en dur : un administrateur y serait envoyé
  // dans un espace qui le renverrait aussitôt vers `/admin`, soit deux
  // redirections et un écran qui clignote pour rien.
  if (authenticated && AUTH_PAGES.some(p => pathname === p || pathname.startsWith(`${p}/`))) {
    // ...sauf s'il portait une action à reprendre (F1.6). Le cas se présente
    // dès qu'une session s'ouvre ailleurs que sur ce formulaire — un second
    // onglet, un lien d'invitation gardé de côté — et l'envoyer à l'accueil
    // reviendrait à perdre l'achat ou l'invitation à l'étape même où le compte
    // vient de naître.
    //
    // Réservé aux non-administrateurs : la destination reprise appartient à
    // l'espace apprenant, où un administrateur n'a rien à faire (arbitrage 87).
    // L'y envoyer ne ferait que déclencher le renvoi vers `/admin` juste en
    // dessous, soit deux redirections et un écran qui clignote.
    const resume = token?.role === 'ADMIN'
      ? null
      : safeCallbackUrl(request.nextUrl.searchParams.get('callbackUrl'))
    return NextResponse.redirect(new URL(resume ?? homeFor(token?.role), request.url))
  }

  // Le cloisonnement de l'administration se décide AVANT le test « cette page
  // exige-t-elle une session ». Certaines pages interdites aux admins sont
  // publiques — `/devenir-formateur` la première : sortie trop tôt, un
  // administrateur y accéderait faute d'avoir été examiné.
  if (
    authenticated && token?.role === 'ADMIN' &&
    NON_ADMIN_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    return NextResponse.redirect(new URL('/admin', request.url))
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
  // Tout le site, sauf les fichiers statiques de Next : le filtre d'octets de
  // contrôle doit voir les routes d'API et les pages publiques. Les gardes de
  // session, elles, restent bornées par `GUARDED_PREFIXES`.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
