// Smoke test des deux exemplaires du catalogue : visiteur et connecté.
//
// Vérifie ce qu'un code HTTP ne dit pas — quelle coquille a réellement été
// rendue, et vers quel espace pointent les liens de la page.
//
//   bun scripts/smoke-espaces.ts
import { config } from 'dotenv'
import { encode } from 'next-auth/jwt'
import { PrismaClient } from '@prisma/client'

config()

const db = new PrismaClient()
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000'

/** Marqueurs de coquille : les `aria-label` des deux barres de navigation. */
const APP_SHELL = 'Navigation de mon espace'
const PUBLIC_SHELL = 'Navigation principale'

let failures = 0

function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function main() {
  const learner = await db.user.findFirst({
    where: { role: 'LEARNER', deletedAt: null, suspendedAt: null },
    select: { id: true, email: true, role: true, sessionsValidAfter: true },
  })
  if (!learner) throw new Error('aucun apprenant en base de dev')

  // Même recette que `scripts/smoke-adhesion.ts` : `userId` et non `sub`,
  // `issuedAt` figé sinon `isSessionRevoked` fait tomber la session.
  const token = await encode({
    token: {
      userId: learner.id,
      email: learner.email,
      role: learner.role,
      adminRole: null,
      trainerId: null,
      sessionsValidAfter: learner.sessionsValidAfter.toISOString(),
      issuedAt: Math.floor(Date.now() / 1000),
    },
    secret: process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production',
  })
  const cookie = `next-auth.session-token=${token}`

  /**
   * Le panneau d'achat a trois états selon les droits du lecteur. Chercher le
   * seul « Acheter maintenant » ferait échouer la fiche dès que l'apprenant de
   * test possède la ressource — un faux négatif, pas un défaut.
   */
  const PURCHASE_PANEL = /Acheter maintenant|Vous poss[eé]d[eè]z d[eé]j[àa]|suspendu le temps/

  const rendered = (html: string, marker: string | RegExp) =>
    typeof marker === 'string' ? html.includes(marker) : marker.test(html)

  const get = async (path: string, authenticated: boolean) => {
    const res = await fetch(`${BASE}${path}`, {
      redirect: 'manual',
      headers: authenticated ? { cookie } : {},
    })
    return { status: res.status, html: res.status === 200 ? await res.text() : '' }
  }

  const course = await db.course.findFirst({
    where: { status: 'published' },
    select: { slug: true },
  })
  const community = await db.community.findFirst({
    where: { status: 'active' },
    select: { slug: true },
  })

  console.log(`\nEspace visiteur (sans session) — ${BASE}`)
  for (const [path, marker] of [
    ['/ressources', 'Le catalogue'],
    ['/communautes', 'Les communautés'],
    ['/formateurs', 'Nos formateurs'],
    ...(course ? [[`/ressources/${course.slug}`, PURCHASE_PANEL]] : []),
    ...(community ? [[`/communautes/${community.slug}`, 'Résiliable à tout moment']] : []),
  ] as [string, string | RegExp][]) {
    const { status, html } = await get(path, false)
    check(
      path,
      status === 200 && html.includes(PUBLIC_SHELL) && !html.includes(APP_SHELL) && rendered(html, marker),
      status !== 200 ? `HTTP ${status}` : '',
    )
  }

  console.log('\nEspace connecté (avec session)')
  for (const [path, marker] of [
    ['/catalogue', 'Le catalogue'],
    ['/catalogue/communautes', 'Les communautés'],
    ['/catalogue/formateurs', 'Nos formateurs'],
    ['/favoris', 'Vos favoris'],
    ...(course ? [[`/catalogue/ressource/${course.slug}`, PURCHASE_PANEL]] : []),
    ...(community ? [[`/catalogue/communautes/${community.slug}`, 'Résiliable à tout moment']] : []),
  ] as [string, string | RegExp][]) {
    const { status, html } = await get(path, true)
    check(
      path,
      status === 200 && html.includes(APP_SHELL) && !html.includes(PUBLIC_SHELL) && rendered(html, marker),
      status !== 200 ? `HTTP ${status}` : '',
    )
  }

  console.log('\nLiens : aucune fuite vers l\'espace visiteur')
  for (const path of ['/accueil', '/catalogue', '/mes-ressources', '/mes-achats', '/favoris']) {
    const { status, html } = await get(path, true)
    // Les `href` visiteur ne doivent plus apparaître dans une page connectée.
    const leaks = [...html.matchAll(/href="(\/(?:ressources|communautes|formateurs)(?:\/[^"?#]*)?)"/g)]
      .map((m) => m[1])
    check(path, status === 200 && leaks.length === 0, leaks.length ? [...new Set(leaks)].join(', ') : '')
  }

  // Les favoris appartiennent à un compte : ni lien vers `/favoris`, ni cœur
  // sur les cartes, dans les pages servies à une personne non connectée.
  console.log("\nFavoris : absents de l'espace visiteur")
  for (const path of ['/', '/ressources', '/recherche', ...(course ? [`/ressources/${course.slug}`] : [])]) {
    const { status, html } = await get(path, false)
    const traces = [
      html.includes('href="/favoris"') ? 'lien /favoris' : null,
      /aux favoris|des favoris/.test(html) ? 'cœur de mise en favori' : null,
    ].filter(Boolean)
    check(path, status === 200 && traces.length === 0, traces.join(', '))
  }

  console.log('\nFavoris : présents dans l\'espace connecté')
  {
    const { status, html } = await get('/catalogue', true)
    check('/catalogue — cœur sur les cartes', status === 200 && /aux favoris|des favoris/.test(html))
    const menu = await get('/accueil', true)
    check('/accueil — entrée « Favoris » au menu du compte', menu.status === 200 && menu.html.includes('href="/favoris"'))
  }

  console.log(
    failures === 0
      ? '\nTout est vert.'
      : `\n${failures} vérification${failures > 1 ? 's' : ''} en échec.`,
  )
  process.exitCode = failures === 0 ? 0 : 1
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
