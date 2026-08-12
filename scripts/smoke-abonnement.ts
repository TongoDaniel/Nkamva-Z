// ==========================================================================
// Smoke test — l'écran d'abonnement du formateur (arbitrages 1 à 19)
// ==========================================================================
// `tsc` vert ne prouve rien, et un 200 non plus : `error.tsx` absorbe les
// plantages de rendu et rend une page d'erreur avec le même code HTTP. On
// vérifie donc le **DOM**, pas le statut.
//
//   SMOKE_BASE_URL=http://localhost:3001 bun scripts/smoke-abonnement.ts

import 'dotenv/config'
import { encode } from 'next-auth/jwt'
import { db } from '../src/lib/db'

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000'

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${label}`)
  else {
    failures += 1
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/**
 * Le RSC coupe les nœuds de texte avec des commentaires `<!-- -->` : les
 * retirer avant toute recherche, sinon une phrase parfaitement rendue paraît
 * absente.
 */
function clean(html: string) {
  return html.replace(/<!--[^>]*-->/g, '')
}

async function main() {
  const trainer = await db.user.findFirst({
    where: { trainerProfile: { isNot: null }, deletedAt: null, suspendedAt: null },
    select: {
      id: true, email: true, role: true, adminRole: true, sessionsValidAfter: true,
      trainerProfile: { select: { id: true, subscriptionStatus: true, autoRenew: true } },
    },
  })
  if (!trainer?.trainerProfile) throw new Error('aucun formateur en base de dev')

  // Même recette que `scripts/smoke-nav-formateur.ts` : `userId` et non `sub`,
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
    return { status: res.status, html: res.status === 200 ? clean(await res.text()) : '' }
  }

  console.log(`\nÉcran d'abonnement — ${BASE}/formateur/abonnement (${trainer.email})`)
  const page = await get('/formateur/abonnement')
  check('la page rend un 200', page.status === 200, `HTTP ${page.status}`)

  // Le test décisif : `error.tsx` rend aussi un 200. Si le titre est là, c'est
  // que le composant a bien rendu.
  check('le titre est rendu', page.html.includes('Mon abonnement'))
  check(
    "la page d'erreur n'a pas pris la main",
    !page.html.includes('Une erreur est survenue') && !page.html.includes("Quelque chose s'est mal passé"),
  )

  check('les quatre tuiles sont là', page.html.includes('prochaine échéance') || page.html.includes('fin de votre abonnement'))
  check('le prélèvement automatique est affiché', page.html.includes('prélèvement automatique'))
  check('les réglages sont rendus', page.html.includes("Réglages de votre abonnement"))
  check('la résiliation est proposée', page.html.includes('Résilier'))
  check('l\'historique des périodes est rendu', page.html.includes('Vos périodes'))

  // L'état par défaut de l'arbitrage 8 doit être lisible tel quel.
  const expected = trainer.trainerProfile.autoRenew ? 'Activé' : 'Désactivé'
  check(`l'état du prélèvement est « ${expected} »`, page.html.includes(expected))

  console.log(`\nEntrée de navigation — ${BASE}/formateur`)
  const home = await get('/formateur')
  check('la page d\'accueil rend', home.status === 200 && home.html.includes('Espace formateur'))
  // Ancrer sur `href=` et non sur le libellé : le texte est coupé par le RSC.
  check(
    'la carte « Mon abonnement » pointe vers le nouvel écran',
    home.html.includes('href="/formateur/abonnement"'),
  )

  console.log(
    failures === 0
      ? '\nTout est vert.'
      : `\n${failures} vérification(s) en échec.`,
  )
  await db.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (err) => {
  console.error(err)
  await db.$disconnect()
  process.exit(1)
})
