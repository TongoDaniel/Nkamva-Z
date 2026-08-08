// Smoke test de la navigation de l'espace connecté.
//
// Vérifie ce qu'un code HTTP ne dit pas : quels onglets porte la barre, lequel
// s'allume sur chaque route — routes rattachées comprises, et une seule à la
// fois — et que les sections formateur restent joignables par les cartes de
// `/formateur`, par le fil d'Ariane et par le menu burger sur mobile.
//
//   bun scripts/smoke-nav-formateur.ts
import { config } from 'dotenv'
import { encode } from 'next-auth/jwt'
import { PrismaClient } from '@prisma/client'

config()

const db = new PrismaClient()
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000'

const APP_NAV = 'Navigation de mon espace'
const APP_NAV_MOBILE = 'Navigation de mon espace (mobile)'
/** L'apostrophe des libellés ressort échappée dans le HTML : `d&#x27;Ariane`. */
const CRUMBS = 'Fil d&#x27;Ariane'
/**
 * La barre de sous-navigation a été retirée : ce gardien empêche qu'elle
 * revienne sans qu'on l'ait décidé.
 */
const SECOND_BAR = /Navigation de l(&#x27;|')espace formateur/

const SECTIONS = [
  '/formateur/ressources',
  '/formateur/communaute',
  '/formateur/lives',
  '/formateur/portefeuille',
  '/formateur/litiges',
]

/** Les onglets de la barre, dans l'ordre, pour un formateur. */
const TABS = ['Accueil', 'Mes ressources', 'Mes communautés', 'Mes achats', 'Espace formateur']

/**
 * Route → onglet qui doit s'allumer. Le catalogue et ses fiches pendent de
 * « Mes ressources », l'annuaire des communautés de « Mes communautés » — plus
 * précis, il l'emporte sur le `/catalogue` du premier.
 */
const CURRENT_TAB: Array<[string, string]> = [
  ['/accueil', 'Accueil'],
  ['/mes-ressources', 'Mes ressources'],
  ['/catalogue', 'Mes ressources'],
  ['/catalogue/formateurs', 'Mes ressources'],
  ['/mes-communautes', 'Mes communautés'],
  ['/catalogue/communautes', 'Mes communautés'],
  ['/mes-achats', 'Mes achats'],
  ['/mes-factures', 'Mes achats'],
  ['/mes-litiges', 'Mes achats'],
  ['/formateur', 'Espace formateur'],
  ['/formateur/portefeuille', 'Espace formateur'],
  ['/formateur/litiges', 'Espace formateur'],
]

let failures = 0

function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

/**
 * Le RSC coupe les nœuds de texte avec des `<!-- -->` : les assertions portent
 * sur les `href=` et sur les `aria-label`, jamais sur une phrase rendue.
 */
function hrefCount(html: string, href: string) {
  return html.split(`href="${href}"`).length - 1
}

/**
 * Isole une barre par son `aria-label`. Le guillemet fermant compte : sans lui,
 * « Navigation de mon espace » attraperait aussi la variante « (mobile) ».
 */
function navSlice(html: string, label: string) {
  const start = html.indexOf(`aria-label="${label}"`)
  if (start < 0) return ''
  const end = html.indexOf('</nav>', start)
  return html.slice(start, end < 0 ? html.length : end)
}

/** Libellés des entrées d'une barre, dans l'ordre du rendu. */
function navLabels(slice: string) {
  return [...slice.matchAll(/<a[^>]*>([^<]*)</g)].map((m) => m[1].trim()).filter(Boolean)
}

/** Libellés des entrées portant `aria-current="page"` — il n'en faut qu'un. */
function navCurrent(slice: string) {
  return [...slice.matchAll(/<a[^>]*aria-current="page"[^>]*>([^<]*)</g)].map((m) => m[1].trim())
}

async function main() {
  const trainer = await db.user.findFirst({
    where: { trainerProfile: { isNot: null }, deletedAt: null, suspendedAt: null },
    select: {
      id: true,
      email: true,
      role: true,
      adminRole: true,
      sessionsValidAfter: true,
      trainerProfile: { select: { id: true } },
    },
  })
  if (!trainer?.trainerProfile) throw new Error('aucun formateur en base de dev')

  // Même recette que `scripts/smoke-espaces.ts` : `userId` et non `sub`,
  // `issuedAt` figé sinon `isSessionRevoked` fait tomber la session.
  const token = await encode({
    token: {
      userId: trainer.id,
      email: trainer.email,
      role: trainer.role,
      adminRole: trainer.adminRole,
      trainerId: trainer.trainerProfile.id,
      sessionsValidAfter: trainer.sessionsValidAfter.toISOString(),
      issuedAt: Math.floor(Date.now() / 1000),
    },
    secret: process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production',
  })
  const cookie = `next-auth.session-token=${token}`

  const get = async (path: string) => {
    const res = await fetch(`${BASE}${path}`, { redirect: 'manual', headers: { cookie } })
    return { status: res.status, html: res.status === 200 ? await res.text() : '' }
  }

  console.log(`\nBarre principale — ${BASE}/accueil (formateur ${trainer.email})`)
  const accueil = await get('/accueil')
  check('/accueil rend la coquille connectée', accueil.status === 200 && accueil.html.includes(APP_NAV), `HTTP ${accueil.status}`)
  const nav = navSlice(accueil.html, APP_NAV)
  check(
    'la barre porte les cinq onglets attendus',
    navLabels(nav).join(' · ') === TABS.join(' · '),
    navLabels(nav).join(' · '),
  )
  for (const href of SECTIONS) {
    check(`${href} a quitté la barre`, hrefCount(nav, href) === 0)
  }
  check("pas de seconde barre de navigation", !SECOND_BAR.test(accueil.html))

  // Un onglet éteint sur toute une famille de routes, c'est l'utilisateur qui
  // ne sait plus où il est ; deux allumés, c'est un `aria-current` en double.
  console.log('\nOnglet courant, route par route')
  for (const [path, expected] of CURRENT_TAB) {
    const page = await get(path)
    const current = navCurrent(navSlice(page.html, APP_NAV))
    check(`${path} → ${expected}`, current.length === 1 && current[0] === expected, current.join(' + ') || 'aucun')
  }

  // Le menu burger n'a pas la contrainte de place de la barre : les cinq
  // sections y sont dépliées, sinon elles coûteraient un écran de plus.
  console.log('\nMenu burger (sous 820px)')
  const burger = navSlice(accueil.html, APP_NAV_MOBILE)
  check('le menu burger est rendu', burger.length > 0)
  check('« Espace formateur » y figure', hrefCount(burger, '/formateur') > 0)
  for (const href of SECTIONS) {
    check(`${href} y est dépliée`, hrefCount(burger, href) === 1)
  }

  console.log(`\nEspace formateur — ${BASE}/formateur`)
  const hub = await get('/formateur')
  check('/formateur répond', hub.status === 200, `HTTP ${hub.status}`)
  check("pas de seconde barre de navigation", !SECOND_BAR.test(hub.html))
  for (const href of SECTIONS) {
    // Les cartes « Gérer votre activité » sont désormais le seul chemin sur
    // grand écran : si l'une perdait son lien, la section deviendrait orpheline.
    check(`${href} est joignable par sa carte`, hrefCount(hub.html, href) >= 1, `${hrefCount(hub.html, href)} lien(s)`)
  }
  // Les lignes de « Vos ressources » ouvrent la fiche : le lien du titre est
  // étendu à la ligne entière, l'assertion porte sur sa cible.
  check(
    'les ressources listées ouvrent leur fiche',
    /href="\/formateur\/ressources\/[0-9a-f-]{36}"/.test(hub.html),
  )

  console.log('\nLes cinq sections')
  for (const href of SECTIONS) {
    const page = await get(href)
    check(`${href} répond`, page.status === 200, `HTTP ${page.status}`)
    check(`${href} n'a pas de seconde barre`, !SECOND_BAR.test(page.html))
    // Sans sous-navigation, le retour à l'espace passe par le fil d'Ariane.
    const crumbs = navSlice(page.html, CRUMBS)
    check(`${href} ramène à l'espace par le fil d'Ariane`, hrefCount(crumbs, '/formateur') === 1)
  }

  console.log(failures === 0 ? '\nTout est vert.\n' : `\n${failures} échec(s).\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
