// Smoke test des infobulles — la règle des textes longs, gardée à l'écran.
//
// Ce que vérifie ce script, et qu'aucun code HTTP ne dit : les paragraphes
// d'explication qui coûtaient un demi-écran de téléphone ne sont plus rendus,
// et le bouton ⓘ qui les porte l'est. Il garde aussi la frontière : les textes
// qui doivent rester à l'air libre — avertissement avant un geste coûteux,
// contrainte de formulaire — sont vérifiés présents, pour qu'un prochain
// passage ne les emporte pas avec le reste.
//
//   bun scripts/smoke-infobulles.ts
import { config } from 'dotenv'
import { encode } from 'next-auth/jwt'
import { PrismaClient } from '@prisma/client'

config()

const db = new PrismaClient()
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000'

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'ÉCHEC'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
}

/**
 * Le HTML rendu échappe les apostrophes (`d&#x27;`) et coupe les nœuds de texte
 * avec des commentaires vides (`<!-- -->`) quand une expression s'y intercale.
 * On normalise les deux avant de chercher une phrase.
 *
 * Et l'on **retire d'abord les `<script>`**. Sans cela, aucune absence n'est
 * vérifiable : le contenu d'une bulle est passé en `children` à un composant
 * client, donc sérialisé dans la charge RSC (`self.__next_f.push`) que porte la
 * page — présent dans la source, absent du DOM tant que la bulle est fermée.
 * Le piège est silencieux : le test échoue en annonçant un texte « toujours
 * affiché » que personne ne voit.
 */
function flat(html: string) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/g, '')
    .replaceAll('<!-- -->', '')
    .replaceAll('&#x27;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ')
}

async function main() {
  const community = await db.community.findFirst({
    where: { status: 'active' },
    select: { id: true, slug: true, trainerId: true },
    orderBy: { subscriptions: { _count: 'desc' } },
  })
  if (!community) throw new Error('Aucune communauté active en base : lancer `bun run db:seed`.')

  const profile = await db.trainerProfile.findUnique({
    where: { id: community.trainerId },
    select: { id: true, userId: true },
  })
  const trainer = await db.user.findUniqueOrThrow({
    where: { id: profile!.userId },
    select: {
      id: true,
      email: true,
      role: true,
      adminRole: true,
      sessionsValidAfter: true,
    },
  })

  const token = await encode({
    token: {
      userId: trainer.id,
      email: trainer.email,
      role: trainer.role,
      adminRole: trainer.adminRole,
      trainerId: profile!.id,
      sessionsValidAfter: trainer.sessionsValidAfter.toISOString(),
      issuedAt: Math.floor(Date.now() / 1000),
    },
    secret: process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production',
  })
  const cookie = `next-auth.session-token=${token}`

  const get = async (path: string) => {
    const res = await fetch(`${BASE}${path}`, { redirect: 'manual', headers: { cookie } })
    return { status: res.status, html: res.status === 200 ? flat(await res.text()) : '' }
  }

  console.log(`\nInfobulles — ${BASE} (formateur ${trainer.email})`)

  // ---------------------------------------------------------------- membres
  console.log('\nMa communauté')
  const communaute = await get('/formateur/communaute?onglet=membres')
  check('/formateur/communaute répond', communaute.status === 200, `HTTP ${communaute.status}`)
  check(
    'le ⓘ du bannissement est posé',
    communaute.html.includes('aria-label="Ce que fait un bannissement"'),
  )
  check(
    "la règle n'est plus imprimée en tête de panneau",
    !communaute.html.includes('Bannir retire la parole'),
  )
  check(
    'le ⓘ des invitations est posé',
    communaute.html.includes('aria-label="Nominative ou parrainage : la différence"'),
  )
  check(
    "la distinction n'est plus imprimée",
    !communaute.html.includes('Une invitation nominative'),
  )
  // La liste tient toujours : les membres sont là, avec leur état et leurs gestes.
  check('les membres sont rendus', communaute.html.includes('Échéance le'))
  check('le geste de bannissement reste offert', communaute.html.includes('Bannir'))
  // Ce qui doit rester visible : l'avertissement conditionnel du renommage.
  check(
    "l'avertissement du renommage n'est pas parti dans une bulle",
    !communaute.html.includes('aria-label="Renommer'),
  )

  // ---------------------------------------------------------------- litiges
  console.log('\nAutres écrans')
  const litiges = await get('/formateur/litiges')
  check('/formateur/litiges répond', litiges.status === 200, `HTTP ${litiges.status}`)
  check(
    "le ⓘ du dossier est posé",
    litiges.html.includes(`aria-label="Ce que vous voyez d'un dossier"`),
  )
  check('la note de bas de liste a disparu', !litiges.html.includes('Le motif détaillé rédigé'))

  const factures = await get('/mes-factures')
  check('/mes-factures répond', factures.status === 200, `HTTP ${factures.status}`)
  check(
    'le ⓘ des factures est posé',
    factures.html.includes(`aria-label="Ce que liste cette page, et d'où vient le PDF"`),
  )
  check('la note du PDF a disparu', !factures.html.includes('Le PDF est regénéré'))

  const lives = await get('/mes-lives')
  check('/mes-lives répond', lives.status === 200, `HTTP ${lives.status}`)
  check(
    'le ⓘ du replay est posé',
    lives.html.includes('aria-label="Ce que devient un live une fois terminé"'),
  )
  check('la note de bas de page a disparu', !lives.html.includes('est enregistré automatiquement'))

  const salon = await get(`/mes-communautes/${community.slug}`)
  check(`/mes-communautes/${community.slug} répond`, salon.status === 200, `HTTP ${salon.status}`)
  check(
    "le ⓘ de l'espace réservé est posé",
    salon.html.includes(`aria-label="Ce que réservé veut dire ici"`),
  )
  check("la note de l'espace réservé a disparu", !salon.html.includes("Ce qui se dit ici n'est"))

  // ------------------------------------------- fiche publique d'une communauté
  console.log('\nMa communauté — fiche publique et salons')
  const fiche = await get('/formateur/communaute')
  for (const [quoi, label] of [
    ['la photo du groupe', `aria-label="À quoi sert la photo du groupe"`],
    ["l'en-tête de section", `aria-label="À propos de « Ce que lit un visiteur »"`],
    ['la présentation', `aria-label="À quoi sert la présentation"`],
    ['les règles', `aria-label="Où les règles s'affichent, et à quoi elles servent"`],
    ['le prix', `aria-label="Ce que devient un changement de prix"`],
    ['la visibilité', `aria-label="Ce que cet état change"`],
    ['les rubriques ouvertes', `aria-label="Ce que fermer une rubrique fait"`],
    ['chaque rubrique', `aria-label="Ce que « Groupe de discussion » ouvre"`],
  ] as const) {
    check(`le ⓘ de ${quoi} est posé`, fiche.html.includes(label))
  }
  check(
    "la règle du prix n’est plus imprimée",
    !fiche.html.includes("ne s'applique qu'aux adhésions"),
  )
  check(
    "l'état de visibilité n'est plus imprimé",
    !fiche.html.includes("apparaît dans l'annuaire"),
  )
  check(
    "le rôle de chaque rubrique n’est plus imprimé",
    !fiche.html.includes('Le fil collectif de la communauté'),
  )

  // ------------------------------------------------------------------ profil
  console.log('\nProfil, sécurité et données')
  const profil = await get('/profil')
  for (const [quoi, label] of [
    ['la photo', `aria-label="À quoi sert votre photo"`],
    ['le nom', `aria-label="Où votre nom apparaît"`],
    ["l'adresse e-mail", `aria-label="Pourquoi l'adresse e-mail ne se change pas ici"`],
    ["les e-mails d’information", `aria-label="Ce que ce réglage ne touche pas"`],
    ['chaque préférence', `aria-label="Ce que couvre « Messages et invitations »"`],
    ['la double authentification', `aria-label="Comment fonctionne la double authentification"`],
  ] as const) {
    check(`le ⓘ de ${quoi} est posé`, profil.html.includes(label))
  }
  check(
    'les paragraphes des cartes ont disparu',
    !profil.html.includes('Ce que NKAMVA vous envoie en plus') &&
      !profil.html.includes('Un nouveau message dans une de vos communautés') &&
      !profil.html.includes('Un code à six chiffres') &&
      !profil.html.includes('Votre nom apparaît sur votre profil public'),
  )

  // ------------------------------------------------------------ portefeuille
  console.log('\nPortefeuille')
  const wallet = await get('/formateur/portefeuille')
  check('le ⓘ du stockage est posé', wallet.html.includes(`aria-label="Quand un changement de palier prend effet"`))
  check('le ⓘ du score est posé', wallet.html.includes(`aria-label="À quoi sert ce score"`))
  check("la cadence n’est plus imprimée", !wallet.html.includes("rien n'est facturé aujourd'hui"))
  check("le seuil du score n’est plus imprimé", !wallet.html.includes('vos retraits sont approuvés'))

  // ------------------------------------------- ce qui reste à l'air libre
  console.log('\nCe qui doit rester lisible sans clic')
  check(
    'la contrainte de format de la couverture reste écrite',
    fiche.html.includes('PNG, JPEG ou WebP, 5 Mo maximum'),
  )
  check(
    'et son traitement passe derrière le ⓘ',
    fiche.html.includes(`aria-label="Ce que devient l'image après l'envoi"`),
  )
  check(
    'la contrainte de format de la photo reste écrite',
    fiche.html.includes('PNG, JPEG ou WebP, 2 Mo maximum'),
  )
  check(
    'le tarif du palier de stockage reste écrit',
    wallet.html.includes('par palier à'),
  )
  // L'onglet « Mes données » n'est pas monté par défaut — `ProfileTabs` ne rend
  // que la rubrique ouverte. On le demande par l'URL, sinon toutes les
  // assertions qui le concernent passeraient à vide.
  const donnees = await get('/profil?onglet=donnees')
  check('le ⓘ de la copie des données est posé', donnees.html.includes(`aria-label="Ce que contient le fichier"`))
  check(
    "le ⓘ de l'export est posé",
    donnees.html.includes(`aria-label="Ce que vous pouvez récupérer"`),
  )
  check(
    'les conséquences de la suppression de compte restent écrites',
    donnees.html.includes('conservés de façon anonymisée') &&
      donnees.html.includes('ne seront plus accessibles'),
  )
  check(
    "le délai de rétractation de la suppression reste écrit",
    donnees.html.includes('vous gardez la main'),
  )
  const compte = await get('/formateur/portefeuille/moyen-de-paiement')
  check(
    'les règles du compte de versement restent écrites',
    compte.status !== 200 || compte.html.includes('Aucun compte de tiers'),
    `HTTP ${compte.status}`,
  )
  const nouvelle = await get('/formateur/ressources/nouvelle')
  check('le ⓘ du format est posé', nouvelle.html.includes(`aria-label="Ce que le format change pour l'acheteur"`))


  console.log(failures === 0 ? '\nTout est vert.' : `\n${failures} échec(s).`)
  if (failures > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
