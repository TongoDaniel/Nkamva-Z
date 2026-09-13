// Smoke test de l'accueil — arbitrage 142.
//
//   bun scripts/smoke-accueil.ts              — vérifie, puis efface ses données
//   KEEP=1 bun scripts/smoke-accueil.ts       — vérifie, garde les données et
//                                               imprime les cookies de session
//   CLEAN=<marque> bun scripts/smoke-accueil.ts — efface ce qu'un KEEP a laissé
//
// Il pose en base un petit monde marqué — deux formateurs, trois communautés
// dont une privée, des séances, des ventes, deux apprenants — puis lit
// `/accueil` et `/formateur` comme le navigateur les reçoit. Ce qu'il tient :
//
//   · la séance d'une communauté rejointe mène à la salle ; celle d'une
//     communauté en tendance mène à la fiche ;
//   · une communauté privée n'apparaît nulle part, pas même dans la charge
//     utile du composant client ;
//   · aucune clé de stockage ne descend dans la page ;
//   · « Tendance » ne s'écrit que s'il y a de quoi classer ;
//   · un compte neuf voit l'invitation, jamais de données inventées.
//
// Le serveur de dev doit tourner. La base visée est celle du `.env` : les lignes
// créées portent toutes la marque, et sont retirées en fin de course.

import { config } from 'dotenv'
import { encode } from 'next-auth/jwt'
import { PrismaClient, type Role } from '@prisma/client'

config()

const db = new PrismaClient()
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000'
const SECRET = process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production'
const KEEP = process.env.KEEP === '1'
const HEURE = 3_600_000
const JOUR = 24 * HEURE

let echecs = 0
function verifier(intitule: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  ok   ${intitule}`)
  else {
    echecs++
    console.log(`  ÉCHEC ${intitule}${detail ? `\n         ${detail}` : ''}`)
  }
}

/** Le texte visible : sans scripts (la charge RSC), sans balises, sans `<!-- -->`. */
function texteDe(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;| | /g, ' ')
    .replace(/\s+/g, ' ')
}

async function nettoyer(marque: string) {
  const users = await db.user.findMany({ where: { email: { startsWith: marque } }, select: { id: true } })
  const ids = users.map((u) => u.id)
  const profiles = await db.trainerProfile.findMany({ where: { userId: { in: ids } }, select: { id: true } })
  const pids = profiles.map((p) => p.id)
  await db.liveSession.deleteMany({ where: { trainerId: { in: pids } } })
  // Par communauté aussi : une vérification au navigateur peut avoir fait
  // adhérer un compte de dev existant à une communauté marquée.
  await db.communitySubscription.deleteMany({
    where: { OR: [{ learnerId: { in: ids } }, { community: { trainerId: { in: pids } } }] },
  })
  await db.purchase.deleteMany({ where: { OR: [{ learnerId: { in: ids } }, { trainerId: { in: pids } }] } })
  await db.courseView.deleteMany({ where: { learnerId: { in: ids } } })
  await db.community.deleteMany({ where: { trainerId: { in: pids } } })
  await db.course.deleteMany({ where: { trainerId: { in: pids } } })
  await db.trainerProfile.deleteMany({ where: { id: { in: pids } } })
  await db.notification.deleteMany({ where: { userId: { in: ids } } })
  await db.user.deleteMany({ where: { id: { in: ids } } })
  console.log(`\n  données « ${marque} » effacées (${ids.length} comptes)`)
}

async function main() {
  if (process.env.CLEAN) {
    await nettoyer(process.env.CLEAN)
    return
  }

  const marque = `smoke-accueil-${Date.now()}`
  const now = Date.now()

  const personne = (suffixe: string, role: 'LEARNER' | 'TRAINER', fullName: string) =>
    db.user.create({ data: { email: `${marque}-${suffixe}@nkamva.test`, role, fullName } })

  const formatriceUser = await personne('formatrice', 'TRAINER', 'Awa Directe')
  const formatrice = await db.trainerProfile.create({
    data: { userId: formatriceUser.id, approvedAt: new Date(now - 90 * JOUR), slogan: 'Montage vidéo' },
  })
  const formateurUser = await personne('formateur', 'TRAINER', 'Brice Tendance')
  const formateur = await db.trainerProfile.create({
    data: { userId: formateurUser.id, approvedAt: new Date(now - 60 * JOUR), slogan: 'Marketing digital' },
  })

  const communaute = (trainerId: string, nom: string, visibility: 'PUBLIC' | 'PRIVATE') =>
    db.community.create({
      data: {
        trainerId, name: nom, slug: `${marque}-${nom.toLowerCase().replace(/\s+/g, '-')}`,
        priceFcfa: 4_000, status: 'active', visibility, eventsEnabled: true,
      },
    })
  const rejointe = await communaute(formatrice.id, 'Atelier Rejoint', 'PUBLIC')
  const enVue = await communaute(formateur.id, 'Cercle En Vue', 'PUBLIC')
  const fermee = await communaute(formateur.id, 'Salon Ferme', 'PRIVATE')

  const membre = await personne('membre', 'LEARNER', 'Koffi Membre')
  const nouveau = await personne('nouveau', 'LEARNER', 'Ama Nouvelle')
  const acheteur = await personne('acheteur', 'LEARNER', 'Yao Acheteur')

  await db.communitySubscription.create({
    data: {
      communityId: rejointe.id, learnerId: membre.id, status: 'ACTIVE',
      periodStart: new Date(now - 3 * JOUR), periodEnd: new Date(now + 27 * JOUR),
    },
  })

  const seance = (c: { id: string; trainerId: string }, title: string, debut: number, status: 'SCHEDULED' | 'LIVE' = 'SCHEDULED') =>
    db.liveSession.create({
      data: {
        communityId: c.id, trainerId: c.trainerId, title, status,
        scheduledStartAt: new Date(debut), startedAt: status === 'LIVE' ? new Date(debut) : null,
        durationMinutes: 90, timeZone: 'Africa/Douala',
        roomName: `${marque}-${Math.random().toString(36).slice(2, 10)}`,
      },
    })
  const enDirect = await seance(rejointe, 'Séance Montage En Cours', now - 10 * 60_000, 'LIVE')
  const demain = await seance(rejointe, 'Séance Montage Demain', now + JOUR)
  const tendance = await seance(enVue, 'Séance Marketing Tendance', now + 2 * JOUR)
  await seance(enVue, 'Séance Marketing Lointaine', now + 10 * JOUR)
  await seance(fermee, 'Séance Salon Secrète', now + 3 * JOUR)

  // Quatre ressources vendues : le membre en possède une, il en reste trois à
  // classer pour lui — juste le seuil de « Tendance ».
  const ressources: Array<{ id: string; slug: string; trainerId: string }> = []
  for (const i of [1, 2, 3, 4]) {
    ressources.push(
      await db.course.create({
        data: {
          trainerId: formateur.id, slug: `${marque}-ressource-${i}`, title: `Guide Tendance ${i}`,
          blurb: 'Accroche', description: 'Description', category: 'marketing', format: 'pdf',
          priceFcfa: 2_500, status: 'published', publishedAt: new Date(now - i * JOUR),
        },
      }),
    )
  }
  const vendre = (course: { id: string; trainerId: string }, learnerId: string) =>
    db.purchase.create({
      data: {
        learnerId, courseId: course.id, trainerId: course.trainerId,
        amountFcfa: 2_500, commissionRate: 0.15, trainerShareFcfa: 2_125, platformShareFcfa: 375,
        provider: 'PAWAPAY', providerStatus: 'SUCCEEDED', createdAt: new Date(now - 2 * JOUR),
      },
    })
  for (const course of ressources) await vendre(course, acheteur.id)
  await vendre(ressources[0], membre.id)

  const jeton = async (u: { id: string; email: string; role: Role }, trainerId: string | null) =>
    `next-auth.session-token=${await encode({
      token: {
        userId: u.id, email: u.email, role: u.role, adminRole: null, trainerId,
        sessionsValidAfter: new Date(0).toISOString(), issuedAt: Math.floor(Date.now() / 1000),
      },
      secret: SECRET,
    })}`
  const cookieMembre = await jeton(membre, null)
  const cookieNouveau = await jeton(nouveau, null)
  const cookieFormatrice = await jeton(formatriceUser, formatrice.id)

  const lire = async (chemin: string, cookie: string) => {
    const res = await fetch(`${BASE}${chemin}`, { headers: { cookie }, redirect: 'manual' })
    return { status: res.status, html: res.status === 200 ? await res.text() : '' }
  }

  try {
    console.log(`\nAccueil — arbitrage 142 — ${BASE}\n`)

    console.log('1. Un membre')
    const m = await lire('/accueil', cookieMembre)
    verifier('/accueil répond', m.status === 200, `HTTP ${m.status}`)
    const mt = texteDe(m.html)
    verifier('le bandeau « En direct maintenant » annonce la séance en cours',
      mt.includes('En direct maintenant') && mt.includes('Séance Montage En Cours'))
    verifier('la rangée « Vos communautés » porte sa communauté', mt.includes('Vos communautés') && mt.includes('Atelier Rejoint'))
    verifier('la vignette mène à l’espace de la communauté', m.html.includes(`href="/mes-communautes/${rejointe.slug}"`))
    verifier('le bloc Événements s’ouvre sur « Mes communautés »',
      /aria-selected="true"[^>]*>Mes communautés/.test(m.html) || /Mes communautés[\s\S]{0,200}aria-selected="true"/.test(m.html))
    verifier('la séance de demain est listée, et mène à la salle',
      mt.includes('Séance Montage Demain') && m.html.includes(`href="/mes-lives/live/${demain.id}"`))
    verifier('la séance en cours porte « En direct »', m.html.includes(`href="/mes-lives/live/${enDirect.id}"`))
    verifier('l’onglet « Tendance » compte les deux séances ouvertes', />Tendance<!-- -->?<span[^>]*>2<\/span>/.test(m.html) || /Tendance\s*2/.test(mt),
      mt.match(/Tendance\s*\d*/)?.[0])
    verifier('la séance privée n’est nulle part, charge client comprise', !m.html.includes('Séance Salon Secrète'))
    // Le bloc Événements est un composant **client** : ses props voyagent pour
    // de bon, en production comprise. C'est là qu'aucune clé ne doit être.
    // Hors de ces fenêtres, `next dev` sérialise aussi les props des composants
    // serveur pour ses outils de débogage — `/mes-ressources` en porte déjà —,
    // ce qui ne dit rien de ce que reçoit un vrai navigateur.
    const fenetres = [enDirect.id, demain.id].map((id) => {
      const at = m.html.indexOf(`\\"id\\":\\"${id}\\"`)
      return at === -1 ? '' : m.html.slice(at, at + 600)
    })
    verifier('les props du bloc Événements portent des adresses, pas des clés',
      fenetres.every((f) => f.includes('thumbnail') && !/S3Key/.test(f)),
      fenetres.map((f) => f.slice(0, 120)).join(' | '))
    verifier('« Mes ressources » porte la ressource achetée, vers le lecteur',
      m.html.includes(`href="/mes-ressources/${ressources[0].id}"`) && mt.includes('À commencer'))
    verifier('« Ressources tendance » : trois ventes classées, la sienne retirée',
      mt.includes('Ressources tendance') && !m.html.includes(`href="/catalogue/ressource/${ressources[0].slug}"`))
    verifier('les formateurs visibles sont listés', mt.includes('Brice Tendance') && mt.includes('Awa Directe'))
    verifier('les tuiles « 0 ressource achetée » ont disparu', !mt.includes('ressource achetée'))
    verifier('aucune étoile de note', !mt.includes('avis)'))

    console.log('\n2. Un compte neuf')
    const n = await lire('/accueil', cookieNouveau)
    verifier('/accueil répond', n.status === 200, `HTTP ${n.status}`)
    const nt = texteDe(n.html)
    verifier('l’invitation remplace la rangée des communautés', nt.includes("Vous n'avez rejoint aucune communauté"))
    verifier('le bloc s’ouvre sur « Tendance »', /aria-selected="true"[^>]*>Tendance/.test(n.html))
    verifier('la séance en tendance mène à la fiche de la communauté',
      nt.includes('Séance Marketing Tendance') && n.html.includes(`href="/catalogue/communautes/${enVue.slug}"`))
    verifier('jamais à la salle d’une communauté non rejointe', !n.html.includes(`/mes-lives/live/${tendance.id}`))
    verifier('le prix d’adhésion remplace la pastille', nt.includes('4 000 FCFA / mois'), nt.match(/\d[\d ]* FCFA \/ mois/)?.[0])
    verifier('la séance privée n’est nulle part', !n.html.includes('Séance Salon Secrète'))
    verifier('pas de rangée « Mes ressources » vide', !n.html.includes('id="mes-ressources"'))

    console.log('\n3. La formatrice')
    const f = await lire('/formateur', cookieFormatrice)
    verifier('/formateur répond', f.status === 200, `HTTP ${f.status}`)
    const ft = texteDe(f.html)
    verifier('le bloc Événements est sur son accueil', ft.includes('Événements à venir'))
    verifier('sa séance mène à la console, marquée « J’anime » ou « En direct »',
      f.html.includes(`href="/formateur/lives/${demain.id}/console"`))
    verifier('sa propre communauté n’est pas en tendance chez elle', !/Atelier Rejoint[\s\S]{0,400}4 000 FCFA \/ mois/.test(ft))
    verifier('les « Prochains directs » de la colonne ont disparu', !ft.includes('Prochains directs'))

    const accueilFormatrice = await lire('/accueil', cookieFormatrice)
    verifier('/accueil renvoie toujours la formatrice vers son espace', accueilFormatrice.status === 307,
      `HTTP ${accueilFormatrice.status}`)
  } finally {
    if (KEEP) {
      console.log(`\n  KEEP=1 — données conservées sous la marque ${marque}`)
      console.log(`  membre     : ${cookieMembre}`)
      console.log(`  nouveau    : ${cookieNouveau}`)
      console.log(`  formatrice : ${cookieFormatrice}`)
      console.log(`  pour effacer : CLEAN=${marque} bun scripts/smoke-accueil.ts`)
    } else {
      await nettoyer(marque)
    }
  }

  console.log(echecs === 0 ? '\nTout est vert.\n' : `\n${echecs} échec(s).\n`)
  process.exitCode = echecs === 0 ? 0 : 1
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
