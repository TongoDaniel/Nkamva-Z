// Smoke test : on n'achète pas sa propre ressource.
//
// Vérifie ce que la suite unitaire ne voit pas — le rendu réel des deux écrans
// concernés, et le refus du service atteint par la vraie route HTTP :
//
//   · la fiche ressource, vue par son auteur, n'offre plus « Acheter » ;
//   · le tunnel /achat/[slug], vu par son auteur, rend l'état « vous êtes
//     l'auteur » au lieu du formulaire de paiement ;
//   · POST /api/purchases/initiate répond 422 CANNOT_BUY_OWN_COURSE, et
//     n'écrit rien ;
//   · la même fiche, vue par quelqu'un d'autre, propose toujours l'achat — le
//     versant qui protège du resserrement excessif.
//
//   bun scripts/smoke-achat-de-soi-meme.ts
//
// Lecture seule sur la base de dev, hormis le contrôle final qui compte les
// achats du formateur avant et après l'appel refusé.
import { config } from 'dotenv'
import { encode } from 'next-auth/jwt'
import { PrismaClient } from '@prisma/client'

config()

const db = new PrismaClient()
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3010'

let failures = 0

function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

/**
 * Le RSC coupe les nœuds de texte avec des `<!-- -->` : les assertions portent
 * sur les `href=` et les `aria-label`, jamais sur une phrase rendue.
 */
function hrefCount(html: string, href: string) {
  return html.split(`href="${href}"`).length - 1
}

async function cookieFor(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true, email: true, role: true, adminRole: true, sessionsValidAfter: true,
      trainerProfile: { select: { id: true } },
    },
  })
  const token = await encode({
    token: {
      userId: user.id,
      email: user.email,
      role: user.role,
      adminRole: user.adminRole,
      trainerId: user.trainerProfile?.id ?? null,
      sessionsValidAfter: user.sessionsValidAfter.toISOString(),
      issuedAt: Math.floor(Date.now() / 1000),
    },
    secret: process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production',
  })
  return `next-auth.session-token=${token}`
}

async function main() {
  // Une ressource publiée, vendue à l'unité (le circuit communauté a sa propre
  // règle), et son auteur.
  const course = await db.course.findFirst({
    where: { status: 'published', circuit: { not: 'COMMUNITY' }, priceFcfa: { gt: 0 } },
    select: {
      id: true, slug: true, title: true,
      trainerProfile: { select: { userId: true } },
    },
  })
  if (!course) throw new Error('aucune ressource publiée vendue à l’unité en base de dev')

  const auteurId = course.trainerProfile.userId
  // Un apprenant qui ne la possède PAS : celui qui l'a déjà achetée voit
  // « Vous possédez déjà cette ressource », et n'apprendrait rien ici.
  const autre = await db.user.findFirst({
    where: {
      id: { not: auteurId }, role: 'LEARNER', deletedAt: null, suspendedAt: null,
      purchases: { none: { courseId: course.id, providerStatus: 'SUCCEEDED' } },
    },
    select: { id: true },
  })
  if (!autre) throw new Error('aucun apprenant sans cette ressource en base de dev')

  console.log(`Ressource : ${course.title} (/${course.slug})`)

  const auteur = await cookieFor(auteurId)
  const acheteur = await cookieFor(autre.id)

  const get = async (path: string, cookie: string) => {
    const res = await fetch(`${BASE}${path}`, { redirect: 'manual', headers: { cookie } })
    return { status: res.status, html: res.status === 200 ? await res.text() : '' }
  }

  // --- La fiche, vue par son auteur ---
  console.log('\nFiche ressource, vue par l’auteur')
  const fiche = await get(`/catalogue/ressource/${course.slug}`, auteur)
  check('rend 200', fiche.status === 200, `HTTP ${fiche.status}`)
  check(
    'ne propose plus « Acheter maintenant »',
    hrefCount(fiche.html, `/achat/${course.slug}`) === 0,
  )
  check(
    'renvoie vers la gestion de la ressource',
    hrefCount(fiche.html, `/formateur/ressources/${course.id}`) === 1,
  )
  check('annonce l’auteur', fiche.html.includes('auteur de cette ressource'))
  check(
    'ne promet plus l’accès après paiement',
    !fiche.html.includes('Accès immédiat après paiement'),
  )
  // Le panneau n'a pas disparu : c'est son contenu qui change.
  check('garde le panneau latéral', fiche.html.includes('aria-label="Votre ressource"'))

  // --- La même fiche, vue par quelqu'un d'autre ---
  console.log('\nFiche ressource, vue par un autre')
  const fiche2 = await get(`/catalogue/ressource/${course.slug}`, acheteur)
  check('rend 200', fiche2.status === 200, `HTTP ${fiche2.status}`)
  check(
    'propose toujours l’achat',
    hrefCount(fiche2.html, `/achat/${course.slug}`) === 1,
  )
  check('garde le panneau d’achat', fiche2.html.includes('aria-label="Acheter cette ressource"'))

  // --- Le tunnel, vu par son auteur ---
  console.log('\nTunnel /achat/[slug], vu par l’auteur')
  const tunnel = await get(`/achat/${course.slug}`, auteur)
  check('rend 200 et non une redirection muette', tunnel.status === 200, `HTTP ${tunnel.status}`)
  check('annonce l’auteur', tunnel.html.includes('Cette ressource est la v'))
  // Le formulaire de paiement ne doit pas être rendu du tout.
  check('ne rend aucun choix de moyen de paiement', !tunnel.html.includes('name="provider"'))
  check(
    'renvoie vers la gestion de la ressource',
    hrefCount(tunnel.html, `/formateur/ressources/${course.id}`) === 1,
  )

  // --- La route, atteinte directement ---
  console.log('\nPOST /api/purchases/initiate, par l’auteur')
  const avant = await db.purchase.count({ where: { learnerId: auteurId, courseId: course.id } })
  const res = await fetch(`${BASE}/api/purchases/initiate`, {
    method: 'POST',
    headers: { cookie: auteur, 'content-type': 'application/json' },
    body: JSON.stringify({ courseId: course.id, provider: 'STRIPE' }),
  })
  const body = await res.json().catch(() => ({}))
  check('refuse en 422', res.status === 422, `HTTP ${res.status}`)
  check(
    'nomme le refus',
    body?.error?.code === 'CANNOT_BUY_OWN_COURSE',
    JSON.stringify(body?.error ?? body),
  )
  const apres = await db.purchase.count({ where: { learnerId: auteurId, courseId: course.id } })
  check('n’écrit aucun achat', apres === avant, `${avant} → ${apres}`)

  // --- Le pendant côté communauté ---
  // Le service refusait déjà (`CANNOT_JOIN_OWN_COMMUNITY`) ; c'est le tunnel
  // qui déroulait encore son formulaire jusqu'au refus.
  const community = await db.community.findFirst({
    where: { status: 'active' },
    select: { slug: true, trainerProfile: { select: { userId: true } } },
  })
  if (community) {
    console.log('\nTunnel /adhesion/[slug], vu par son animateur')
    const animateur = await cookieFor(community.trainerProfile.userId)
    const adhesion = await get(`/adhesion/${community.slug}`, animateur)
    check('rend 200', adhesion.status === 200, `HTTP ${adhesion.status}`)
    check('annonce l’animateur', adhesion.html.includes('Cette communaut'))
    check('ne rend aucun choix de moyen de paiement', !adhesion.html.includes('name="provider"'))
    // `>= 1` et non `=== 1` : la barre de navigation de l'espace formateur
    // porte déjà ce lien, l'état en ajoute un second dans le corps de page.
    check(
      'renvoie vers la gestion de la communauté',
      hrefCount(adhesion.html, '/formateur/communaute') >= 1,
    )
  }

  console.log(failures === 0 ? '\nTout est vert.' : `\n${failures} échec(s).`)
  process.exitCode = failures === 0 ? 0 : 1
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
