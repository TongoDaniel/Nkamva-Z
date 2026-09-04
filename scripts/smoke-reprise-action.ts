// Smoke test de la reprise de l'action après authentification (arbitrage 124,
// F1.6), contre le serveur de développement.
//
//   bun scripts/smoke-reprise-action.ts
//
// Vérifie que la destination survit à **chaque relais** de la chaîne. Le défaut
// couvert ne se voit sur aucun écran pris isolément : chacun fonctionne, c'est
// le passage de l'un à l'autre qui perdait la destination.
//
// Les assertions s'ancrent sur `href=` et non sur du texte rendu : le HTML d'un
// composant serveur porte des marqueurs `<!-- -->` entre les nœuds, et un
// libellé peut être coupé en deux par le flux RSC.
//
// **Portée.** Ce script couvre les relais *serveur*. Les deux sauts *client* —
// après création de compte, et après code validé — sont des `router.push` : ils
// n'existent que dans le navigateur et aucune requête HTTP ne les révèle. Ils se
// vérifient à la main, une fois, ainsi :
//
//   1. commenter `RESEND_API_KEY` dans `.env` et redémarrer le serveur de dev —
//      `sendEmail()` bascule alors sur son repli et journalise `[EMAIL:DEV]`
//      au lieu d'envoyer. Sans cette étape, la recette expédie un vrai courriel
//      à une adresse en `.test`, qui rebondit ;
//   2. s'inscrire depuis `/auth/inscription?callbackUrl=/achat/…` ;
//   3. relire le code dans les journaux du serveur : le sujet de l'e-mail le
//      porte en clair (« votre code de vérification : 123456 ») ;
//   4. le saisir, puis se connecter. L'arrivée doit être la destination
//      demandée, pas `/accueil`.
//
// Fait le 4 septembre 2026, chaîne complète verte jusqu'à « Finaliser l'achat ».
// Aucune base : tout ce qui est vérifié ici se décide dans le middleware, qui
// tourne sur le runtime Edge et n'a précisément **pas** la base — il ne juge que
// le jeton. Un jeton forgé de toutes pièces suffit donc, et le test reste
// exécutable quand la base de développement est injoignable.
import { config } from 'dotenv'
import { encode } from 'next-auth/jwt'

config()

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000'

/** Destination de test : une route gardée par le middleware. */
const CIBLE = '/achat/architecture-logicielle-moderne'
const CIBLE_ENCODEE = encodeURIComponent(CIBLE)

let echecs = 0

function verifier(intitule: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ok   ${intitule}`)
  } else {
    echecs++
    console.log(`  ÉCHEC ${intitule}${detail ? `\n         ${detail}` : ''}`)
  }
}

/** Jeton de session synthétique — le middleware ne regarde rien d'autre. */
async function cookieFor(role: 'LEARNER' | 'ADMIN') {
  const token = await encode({
    token: {
      userId: '00000000-0000-4000-8000-000000000001',
      email: 'smoke@nkamva.test',
      role,
      adminRole: role === 'ADMIN' ? 'SUPER_ADMIN' : null,
      trainerId: null,
      sessionsValidAfter: new Date(0).toISOString(),
      issuedAt: Math.floor(Date.now() / 1000),
    },
    secret: process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production',
  })
  return `next-auth.session-token=${token}`
}

/** Toutes les destinations effectivement présentes dans un `href` de la page. */
function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map(m => m[1])
}

async function main() {
  console.log(`\nReprise de l'action — ${BASE}\n`)

  // --- 1. La garde pose la destination -------------------------------------
  console.log('1. Le middleware pose la destination sur une route gardée')
  {
    const res = await fetch(`${BASE}${CIBLE}`, { redirect: 'manual' })
    const location = res.headers.get('location') ?? ''
    verifier(
      'un visiteur est renvoyé vers la connexion avec sa destination',
      res.status >= 300 && res.status < 400 &&
        location.includes('/auth/connexion') && location.includes(CIBLE_ENCODEE),
      `statut ${res.status}, Location « ${location} »`,
    )
  }

  // --- 2. La connexion la transmet à l'inscription --------------------------
  console.log("\n2. La connexion transmet la destination à l'inscription")
  {
    const res = await fetch(`${BASE}/auth/connexion?callbackUrl=${CIBLE_ENCODEE}`)
    const html = await res.text()
    verifier(
      "le lien « Se connecter → créer un compte » porte la destination",
      html.includes(`href="/auth/inscription?callbackUrl=${CIBLE_ENCODEE}"`),
      "aucun href=\"/auth/inscription?callbackUrl=…\" dans la page",
    )
  }

  // --- 3. L'inscription la rend à la connexion ------------------------------
  console.log("\n3. L'inscription rend la destination à la connexion")
  {
    const res = await fetch(`${BASE}/auth/inscription?callbackUrl=${CIBLE_ENCODEE}`)
    const html = await res.text()
    verifier(
      'la page est rendue derrière sa frontière Suspense',
      res.status === 200 && html.includes('href="/auth/connexion'),
      `statut ${res.status}`,
    )
    verifier(
      "le lien « Déjà un compte ? » porte la destination",
      html.includes(`href="/auth/connexion?callbackUrl=${CIBLE_ENCODEE}"`),
      "aucun href=\"/auth/connexion?callbackUrl=…\" dans la page",
    )
  }

  // --- 4. Une destination hostile est refusée, sans casser l'écran ----------
  // L'assertion porte sur les `href` et non sur la présence du texte : Next
  // recopie l'URL demandée dans la charge RSC de la page, si bien que la chaîne
  // hostile y figure forcément **comme donnée**. Ce qui compte est qu'aucun lien
  // ne la porte, et que l'écran reste servi plutôt que de tomber en erreur.
  console.log('\n4. Une destination hostile est refusée, sans casser l\'écran')
  for (const hostile of ['//evil.example', 'https://evil.example', '/\\evil.example', '/\tevil.example']) {
    const res = await fetch(`${BASE}/auth/connexion?callbackUrl=${encodeURIComponent(hostile)}`)
    const html = await res.text()
    const liens = hrefs(html)
    verifier(
      `« ${hostile.replace('\t', '\\t')} » n'atterrit dans aucun lien, et la page reste servie`,
      res.status === 200 &&
        !liens.some(h => h.includes('evil.example')) &&
        liens.includes('/auth/inscription'),
      `statut ${res.status}, liens suspects : ${liens.filter(h => h.includes('evil')).join(', ') || 'aucun'}`,
    )
  }

  // --- 5. Un connecté qui rouvre la connexion reprend son action ------------
  console.log('\n5. Un connecté qui rouvre la connexion reprend son action')
  {
    const cookie = await cookieFor('LEARNER')
    const ou = async (query: string) => {
      const res = await fetch(`${BASE}/auth/connexion${query}`, { headers: { cookie }, redirect: 'manual' })
      return res.headers.get('location') ?? ''
    }

    verifier(
      "il repart vers sa destination, pas vers l'accueil",
      (await ou(`?callbackUrl=${encodeURIComponent('/mes-ressources')}`)).includes('/mes-ressources'),
      `Location « ${await ou(`?callbackUrl=${encodeURIComponent('/mes-ressources')}`)} »`,
    )
    verifier(
      'sans destination, il repart vers son accueil',
      (await ou('')).includes('/accueil'),
      `Location « ${await ou('')} »`,
    )
    const hostile = await ou(`?callbackUrl=${encodeURIComponent('//evil.example')}`)
    verifier(
      'une destination hostile retombe sur son accueil',
      hostile.includes('/accueil') && !hostile.includes('evil.example'),
      `Location « ${hostile} »`,
    )
  }

  // --- 6. Un administrateur n'est jamais renvoyé dans l'espace apprenant ----
  console.log("\n6. Un administrateur n'est pas emporté par la destination")
  {
    const cookie = await cookieFor('ADMIN')
    const res = await fetch(`${BASE}/auth/connexion?callbackUrl=${encodeURIComponent('/mes-ressources')}`, {
      headers: { cookie },
      redirect: 'manual',
    })
    const location = res.headers.get('location') ?? ''
    verifier(
      'il va dans son back-office, pas dans « Mes ressources » (arbitrage 87)',
      location.includes('/admin') && !location.includes('/mes-ressources'),
      `Location « ${location} »`,
    )
  }

  console.log(echecs === 0 ? '\nTout passe.\n' : `\n${echecs} échec(s).\n`)
  process.exit(echecs === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
