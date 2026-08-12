// Smoke test du Lot 1 — le socle des états de chargement.
//
// Vérifie ce qu'un code HTTP ne dit pas : que la fiche formateur rend bien le
// lien-bouton `BtnLink` (et non une frontière serveur/client cassée absorbée
// par `error.tsx`, qui répondrait 200 tout de même), et que les actions
// publier / archiver migrées vers `useAction` sont toujours à l'écran.
//
//   bun scripts/smoke-etats-chargement.ts
import { config } from 'dotenv'
import { encode } from 'next-auth/jwt'
import { PrismaClient } from '@prisma/client'

config()

const db = new PrismaClient()
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000'

let failures = 0

function check(ok: boolean, label: string, detail = '') {
  if (ok) {
    console.log(`  ✓ ${label}`)
  } else {
    failures++
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/**
 * Le rendu RSC coupe les nœuds de texte par des commentaires vides : sans les
 * retirer, « Voir la fiche publique » ressort en « Voir la<!-- --> fiche… » et
 * l'assertion tombe en faux rouge.
 */
function flatten(html: string) {
  return html.replace(/<!--[^>]*-->/g, '')
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

  // Même recette que `scripts/smoke-nav-formateur.ts` : `userId` et non `sub`,
  // `issuedAt` figé sinon `isSessionRevoked` fait tomber la session.
  const cookie = `next-auth.session-token=${await encode({
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
  })}`

  const get = async (path: string) => {
    const res = await fetch(`${BASE}${path}`, { redirect: 'manual', headers: { cookie } })
    return { status: res.status, html: res.status === 200 ? flatten(await res.text()) : '' }
  }

  const published = await db.course.findFirst({
    where: { trainerId: trainer.trainerProfile.id, status: 'published' },
    select: { id: true, slug: true, title: true },
  })

  console.log(`\nListe des ressources — ${BASE}/formateur/ressources (${trainer.email})`)
  const list = await get('/formateur/ressources')
  check(list.status === 200, 'la liste répond', `HTTP ${list.status}`)
  // `error.tsx` rend un 200 : c'est le DOM qui départage un écran vivant d'un
  // écran effondré.
  check(
    !/Une erreur est survenue|Something went wrong/i.test(list.html),
    'la liste n\'est pas tombée sur sa frontière d\'erreur',
  )
  check(
    /Publier|Archiver/.test(list.html),
    'les actions migrées vers useAction sont rendues',
  )

  if (!published) {
    console.log('\n(aucune ressource publiée en base : le BtnLink n\'est pas exigible)')
  } else {
    console.log(`\nFiche d'édition — /formateur/ressources/${published.id}`)
    const detail = await get(`/formateur/ressources/${published.id}`)
    check(detail.status === 200, 'la fiche répond', `HTTP ${detail.status}`)
    check(
      !/Une erreur est survenue|Something went wrong/i.test(detail.html),
      'la fiche n\'est pas tombée sur sa frontière d\'erreur',
    )

    // Le cœur du test : `BtnLink` doit rendre un vrai `<a href>`, sans quoi le
    // clic milieu et l'ouverture dans un onglet seraient perdus.
    const anchor = detail.html.match(
      new RegExp(`<a[^>]*href="/ressources/${published.slug}"[^>]*>`),
    )
    check(Boolean(anchor), 'BtnLink rend un ancrage href vers la fiche publique')
    check(
      Boolean(anchor && /rounded-full/.test(anchor[0])),
      'BtnLink porte bien l\'habillage de bouton',
      anchor?.[0]?.slice(0, 120),
    )
    check(
      /Voir la fiche publique/.test(detail.html),
      'le libellé du lien-bouton est présent',
    )
    check(/Archiver/.test(detail.html), 'les actions de la fiche sont rendues')
  }

  console.log(failures === 0 ? '\nTout est vert.' : `\n${failures} échec(s).`)
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (err) => {
  console.error(err)
  await db.$disconnect()
  process.exit(1)
})
