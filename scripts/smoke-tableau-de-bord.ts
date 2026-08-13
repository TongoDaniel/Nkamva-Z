// Smoke test du tableau de bord `/accueil`.
//
// Ce qu'un code HTTP ne dit pas — et ici il ne dit vraiment rien, puisque
// `(app)/error.tsx` renvoie 200 en absorbant un plantage de rendu :
//
//   - l'arrangement rendu correspond bien au rôle (formateur / apprenant) ;
//   - le formateur ne voit plus ses propres publications proposées à l'achat
//     dans « Nouveautés du catalogue » ;
//   - `/accueil` et `/formateur` annoncent le **même** solde, sous le même
//     libellé — c'est la divergence que `wallet-label.ts` a fermée ;
//   - le vert de l'administration n'a pas fuité dans l'espace connecté.
//
//   bun scripts/smoke-tableau-de-bord.ts
import { config } from 'dotenv'
import { encode } from 'next-auth/jwt'
import { PrismaClient } from '@prisma/client'

config()

const db = new PrismaClient()
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000'

/** Le texte du périmètre d'erreur : le rencontrer veut dire que le rendu a sauté. */
const ERROR_BOUNDARY = 'Une erreur est survenue'

let failures = 0

function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

/**
 * Le RSC coupe les nœuds de texte avec des `<!-- -->` : les assertions portent
 * sur les `id=`, les `href=` et les `aria-label`, jamais sur une phrase rendue.
 */
const hasSection = (html: string, id: string) => html.includes(`id="${id}"`)
const hrefCount = (html: string, href: string) => html.split(`href="${href}"`).length - 1

/** Le libellé de la tuile de solde, tel qu'il sort du rendu. */
function walletLabelOf(html: string): string | null {
  return html.match(/retirable(?:[^<]*)/)?.[0].trim() ?? null
}

async function cookieFor(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      adminRole: true,
      sessionsValidAfter: true,
      trainerProfile: { select: { id: true } },
    },
  })
  // Recette de `smoke-nav-formateur.ts` : `userId` et non `sub`, `issuedAt`
  // figé sinon `isSessionRevoked` fait tomber la session.
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

async function get(path: string, cookie: string) {
  const res = await fetch(`${BASE}${path}`, { redirect: 'manual', headers: { cookie } })
  return { status: res.status, html: res.status === 200 ? await res.text() : '' }
}

async function main() {
  const trainer = await db.user.findFirst({
    where: { trainerProfile: { isNot: null }, deletedAt: null, suspendedAt: null },
    select: { id: true, email: true, trainerProfile: { select: { id: true, subscriptionStatus: true } } },
  })
  if (!trainer?.trainerProfile) throw new Error('aucun formateur en base de dev')

  const learner = await db.user.findFirst({
    where: { trainerProfile: { is: null }, deletedAt: null, suspendedAt: null, adminRole: null },
    select: { id: true, email: true },
  })
  if (!learner) throw new Error('aucun apprenant sans profil formateur en base de dev')

  const trainerCookie = await cookieFor(trainer.id)
  const learnerCookie = await cookieFor(learner.id)

  // ------------------------------------------------------------------
  console.log(`\nArrangement formateur — ${BASE}/accueil (${trainer.email})`)
  const home = await get('/accueil', trainerCookie)
  check('/accueil répond', home.status === 200, `HTTP ${home.status}`)
  // `(app)/error.tsx` rend un 200 : sans cette assertion, tout le reste du
  // fichier passerait au vert sur une page plantée.
  check("le périmètre d'erreur ne s'est pas déclenché", !home.html.includes(ERROR_BOUNDARY))
  check('la file « À traiter » est rendue', hasSection(home.html, 'a-traiter'))
  check('le bloc « Reprendre » survit en colonne latérale', hasSection(home.html, 'reprendre'))

  const started = home.html.includes('id="demarrage"')
  const published = await db.course.count({
    where: { trainerId: trainer.trainerProfile.id, status: 'published' },
  })
  check(
    'le régime correspond aux publications réelles',
    started === (published === 0),
    started ? 'démarrage' : `croisière (${published} publiée(s))`,
  )
  if (!started) {
    check('les publications sont listées', hasSection(home.html, 'publications'))
  }

  // ------------------------------------------------------------------
  console.log('\nLes nouveautés ne proposent pas ses propres ressources')
  const own = await db.course.findMany({
    where: { trainerId: trainer.trainerProfile.id, status: 'published', circuit: 'MARKETPLACE' },
    select: { slug: true, title: true },
  })
  check('le formateur a des ressources publiées à écarter', own.length > 0, `${own.length} ressource(s)`)
  const leaked = own.filter((c) => hrefCount(home.html, `/catalogue/ressource/${c.slug}`) > 0)
  // Le lien de la fiche marchande est le seul en cause : « Vos publications »
  // pointe vers `/formateur/ressources/<id>`, qui n'a rien à voir.
  check(
    'aucune de ses ressources ne mène à sa propre fiche marchande',
    leaked.length === 0,
    leaked.map((c) => c.title).join(', ') || 'aucune fuite',
  )

  // ------------------------------------------------------------------
  console.log('\nLe solde dit la même chose sur les deux écrans')
  const hub = await get('/formateur', trainerCookie)
  check('/formateur répond', hub.status === 200, `HTTP ${hub.status}`)
  check("le périmètre d'erreur ne s'est pas déclenché", !hub.html.includes(ERROR_BOUNDARY))
  const homeLabel = started ? null : walletLabelOf(home.html)
  const hubLabel = walletLabelOf(hub.html)
  check('/formateur porte le libellé « retirable »', hubLabel !== null, hubLabel ?? 'absent')
  if (!started) {
    check(
      'les deux écrans portent le même libellé de solde',
      homeLabel !== null && homeLabel === hubLabel,
      `accueil « ${homeLabel} » · formateur « ${hubLabel} »`,
    )
  }

  // ------------------------------------------------------------------
  console.log("\nL'action principale suit le droit d'écrire")
  const status = trainer.trainerProfile.subscriptionStatus
  const canWrite = status !== 'SUSPENDED' && status !== 'CANCELED'
  check(
    canWrite ? '« Publier une ressource » est proposé' : '« Publier une ressource » est retiré',
    (hrefCount(home.html, '/formateur/ressources/nouvelle') > 0) === canWrite,
    `abonnement ${status}`,
  )

  // ------------------------------------------------------------------
  console.log(`\nArrangement apprenant — ${BASE}/accueil (${learner.email})`)
  const learnerHome = await get('/accueil', learnerCookie)
  check('/accueil répond', learnerHome.status === 200, `HTTP ${learnerHome.status}`)
  check("le périmètre d'erreur ne s'est pas déclenché", !learnerHome.html.includes(ERROR_BOUNDARY))
  check('« Reprendre » est rendu', hasSection(learnerHome.html, 'reprendre'))
  check("aucune file formateur n'apparaît", !hasSection(learnerHome.html, 'a-traiter'))
  check("aucune publication n'apparaît", !hasSection(learnerHome.html, 'publications'))
  check(
    "aucun lien vers l'espace formateur",
    hrefCount(learnerHome.html, '/formateur') === 0 &&
      hrefCount(learnerHome.html, '/formateur/ressources/nouvelle') === 0,
  )

  // ------------------------------------------------------------------
  // Le vert est réservé à l'administration, sous le scope `.nk-admin`. Une
  // fuite ici repeindrait les tuiles et les anneaux de progression.
  console.log("\nLa marque reste bleue")
  check('pas de scope admin sur /accueil', !home.html.includes('nk-admin'))
  check('pas de scope admin sur /formateur', !hub.html.includes('nk-admin'))

  console.log(failures === 0 ? '\nTout est vert.\n' : `\n${failures} échec(s).\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
