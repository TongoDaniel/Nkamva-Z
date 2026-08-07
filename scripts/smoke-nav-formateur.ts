// Smoke test du regroupement des sections formateur.
//
// Vérifie ce qu'un code HTTP ne dit pas : que la barre principale ne porte plus
// que « Espace formateur », et que les cinq sections sont bien joignables depuis
// la sous-navigation de l'espace et depuis les cartes de sa page d'accueil.
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
/** L'apostrophe du libellé ressort échappée dans le HTML : `l&#x27;espace`. */
const TRAINER_NAV = /Navigation de l(&#x27;|')espace formateur/

const SECTIONS = [
  '/formateur/ressources',
  '/formateur/communaute',
  '/formateur/lives',
  '/formateur/portefeuille',
  '/formateur/litiges',
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
  check('« Espace formateur » est resté dans la barre', hrefCount(nav, '/formateur') > 0)
  for (const href of SECTIONS) {
    check(`${href} a quitté la barre`, hrefCount(nav, href) === 0)
  }
  check("la sous-navigation n'apparaît pas hors de l'espace", !TRAINER_NAV.test(accueil.html))

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
  check('la sous-navigation est rendue', TRAINER_NAV.test(hub.html))
  for (const href of SECTIONS) {
    // Deux occurrences attendues : l'entrée de la sous-navigation et la carte.
    check(`${href} est joignable depuis l'espace`, hrefCount(hub.html, href) >= 2, `${hrefCount(hub.html, href)} lien(s)`)
  }

  console.log('\nLes cinq sections')
  for (const href of SECTIONS) {
    const page = await get(href)
    check(`${href} répond`, page.status === 200, `HTTP ${page.status}`)
    check(`${href} porte la sous-navigation`, TRAINER_NAV.test(page.html))
    // Le lien de retour du fil d'Ariane, en plus de la sous-navigation.
    check(`${href} ramène à l'espace`, hrefCount(page.html, '/formateur') >= 2)
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
