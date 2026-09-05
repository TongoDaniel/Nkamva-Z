// Smoke test du lot 9 — agenda des séances et salon du replay (F6).
//
//   bun scripts/smoke-lives-replay.ts
//   KEEP=1 bun scripts/smoke-lives-replay.ts
//
// ## Ce que ce test établit, et ce qu'il ne peut pas établir
//
// Il **reproduit le parcours** que l'audit disait cassé — un formateur
// programme une séance, elle doit apparaître chez lui et chez ses membres — et
// vérifie le salon rattaché au replay (F6.7), qui était le vrai manque.
//
// Il **ne teste pas le micro** : cela demande deux navigateurs équipés d'un
// périphérique audio, et deux personnes dans la même salle. Ce qui est
// vérifiable sans appareil — qu'un refus du navigateur soit nommé plutôt que
// silencieux — l'est par lecture du code, pas ici.
import { config } from 'dotenv'
import { encode } from 'next-auth/jwt'
import { PrismaClient } from '@prisma/client'

config()

const db = new PrismaClient()
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000'
const KEEP = process.env.KEEP === '1'
const JOUR = 86_400_000

let echecs = 0
function verifier(intitule: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  ok   ${intitule}`)
  else {
    echecs++
    console.log(`  ÉCHEC ${intitule}${detail ? `\n         ${detail}` : ''}`)
  }
}

function texteDe(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;| | /g, ' ')
    .replace(/\s+/g, ' ')
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])
}

async function main() {
  const marque = `smoke-live-${Date.now()}`

  const trainerUser = await db.user.create({
    data: { email: `${marque}-formateur@nkamva.test`, role: 'TRAINER', fullName: 'Formatrice Directe' },
  })
  const profile = await db.trainerProfile.create({
    data: { userId: trainerUser.id, verifiedLegalName: 'Formatrice Directe', approvedAt: new Date() },
  })
  await db.wallet.create({ data: { trainerId: profile.id, balance: 0 } })
  const community = await db.community.create({
    data: {
      trainerId: profile.id, name: 'Cercle des directs', slug: `${marque}-cercle`,
      priceFcfa: 5_000, status: 'active', visibility: 'PUBLIC', eventsEnabled: true,
    },
  })

  const learner = await db.user.create({
    data: { email: `${marque}-apprenant@nkamva.test`, role: 'LEARNER', fullName: 'Membre Direct' },
  })
  await db.communitySubscription.create({
    data: {
      communityId: community.id, learnerId: learner.id, status: 'ACTIVE',
      periodStart: new Date(Date.now() - 5 * JOUR), periodEnd: new Date(Date.now() + 25 * JOUR),
    },
  })

  const jeton = (u: { id: string; email: string }, role: 'LEARNER' | 'TRAINER', tid: string | null) =>
    encode({
      token: {
        userId: u.id, email: u.email, role, adminRole: null, trainerId: tid,
        sessionsValidAfter: new Date(0).toISOString(),
        issuedAt: Math.floor(Date.now() / 1000),
      },
      secret: process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production',
    })
  const cookieFormateur = `next-auth.session-token=${await jeton(trainerUser, 'TRAINER', profile.id)}`
  const cookieMembre = `next-auth.session-token=${await jeton(learner, 'LEARNER', null)}`

  const lire = async (chemin: string, cookie: string) =>
    (await fetch(`${BASE}${chemin}`, { headers: { cookie } })).text()

  try {
    console.log(`\nLot 9 — lives et replays — ${BASE}\n`)

    console.log('1. Une séance programmée apparaît — le constat non reproduit')
    const quand = new Date(Date.now() + 3 * JOUR)
    const creation = await fetch(`${BASE}/api/lives`, {
      method: 'POST',
      headers: { cookie: cookieFormateur, 'content-type': 'application/json' },
      body: JSON.stringify({
        communityId: community.id,
        title: 'Revue de checklists QA',
        scheduledStartAt: quand.toISOString(),
        durationMinutes: 60,
        timeZone: 'Africa/Douala',
      }),
    })
    verifier('la programmation passe', creation.status === 201, `statut ${creation.status}`)

    const agendaFormateur = texteDe(await lire('/mes-lives', cookieFormateur))
    verifier("elle est dans l'agenda de son animateur", agendaFormateur.includes('Revue de checklists QA'))

    const agendaMembre = texteDe(await lire('/mes-lives', cookieMembre))
    verifier("et dans celui du membre", agendaMembre.includes('Revue de checklists QA'))

    // L'espace de la communauté rend ses rubriques **à la demande** : le
    // panneau « Sessions » n'entre dans le document qu'une fois l'onglet
    // choisi. Ce qu'on peut donc vérifier sans clic, c'est que l'onglet
    // annonce la séance — c'est aussi ce que le membre voit en arrivant.
    const espace = texteDe(await lire(`/mes-communautes/${community.slug}`, cookieMembre))
    verifier("et l'espace de la communauté l'annonce", /Sessions\s*1/.test(espace),
      espace.match(/Sessions\s*\d+/)?.[0] ?? 'aucun onglet Sessions')

    const api = (await (await fetch(`${BASE}/api/lives`, { headers: { cookie: cookieMembre } })).json()) as {
      data?: Array<{ title: string; timeZone: string | null }>
    }
    verifier("l'API du membre la rend aussi", (api.data ?? []).some((s) => s.title === 'Revue de checklists QA'))
    // Arbitrage 107 — le fuseau où l'heure a été pensée voyage avec la séance.
    verifier('avec le fuseau de saisie', (api.data ?? [])[0]?.timeZone === 'Africa/Douala',
      String((api.data ?? [])[0]?.timeZone))

    console.log('\n2. Le salon de la séance est rattaché au replay (F6.7)')
    const debut = new Date(Date.now() - 2 * JOUR)
    const seance = await db.liveSession.create({
      data: {
        communityId: community.id, trainerId: profile.id,
        title: 'Atelier montage — séance 4', scheduledStartAt: debut,
        status: 'ENDED', startedAt: debut, endedAt: new Date(debut.getTime() + 3_600_000),
        roomName: `nkamva-${Math.random().toString(36).slice(2, 10)}`,
      },
    })
    const replay = await db.replay.create({
      data: {
        sessionId: seance.id, communityId: community.id, trainerId: profile.id,
        title: seance.title, recordedAt: debut, durationSeconds: 3_600,
        status: 'READY', s3Key: 'replays/fixture.mp4',
        purgeAt: new Date(Date.now() + 700 * JOUR),
      },
    })
    for (const [minute, auteur, corps] of [
      [-4, learner.id, 'Bonsoir, je suis un peu en avance'],
      [21, learner.id, 'Question sur le point 3'],
      [48, trainerUser.id, 'Je reprends ça en fin de séance'],
    ] as const) {
      await db.liveMessage.create({
        data: {
          sessionId: seance.id, authorId: auteur, body: corps,
          createdAt: new Date(debut.getTime() + minute * 60_000),
        },
      })
    }
    const retire = await db.liveMessage.create({
      data: {
        sessionId: seance.id, authorId: learner.id, body: 'Propos instruit par la Modération',
        createdAt: new Date(debut.getTime() + 30 * 60_000), deletedAt: new Date(),
      },
    })

    const pageReplay = texteDe(await lire(`/mes-lives/replay/${replay.id}`, cookieMembre))
    verifier('le salon figure sur la page du replay', pageReplay.includes('Le salon de la séance'))
    verifier('avec ce qui y a été dit', pageReplay.includes('Question sur le point 3'))
    verifier('et par qui', pageReplay.includes('Membre Direct') && pageReplay.includes('Formatrice Directe'))
    verifier('chaque message porte sa minute', pageReplay.includes('21:00') && pageReplay.includes('48:00'))
    verifier("ce qui précède l'ouverture est dit « avant »", pageReplay.includes('avant'))
    // Le retrait vaut pour le direct comme pour le replay.
    verifier('un message retiré ne revient pas', !pageReplay.includes('Propos instruit'),
      `message ${retire.id}`)

    console.log('\n3. Le chemin court vers les enregistrements')
    const htmlOnglet = await lire('/mes-lives?onglet=replays', cookieMembre)
    verifier("`?onglet=replays` ouvre la liste des replays",
      texteDe(htmlOnglet).includes('Atelier montage'))
    verifier('qui mène à la page du replay',
      hrefs(htmlOnglet).includes(`/mes-lives/replay/${replay.id}`))

    console.log("\n4. Le salon suit l'accès du replay, pas l'inverse")
    const etranger = await db.user.create({
      data: { email: `${marque}-etranger@nkamva.test`, role: 'LEARNER', fullName: 'Étrangère' },
    })
    const cookieEtranger = `next-auth.session-token=${await jeton(etranger, 'LEARNER', null)}`
    const refus = await fetch(`${BASE}/mes-lives/replay/${replay.id}`, {
      headers: { cookie: cookieEtranger },
    })
    // 404 et non 403 : dire « interdit » révélerait que l'enregistrement existe.
    verifier('un non-membre reçoit 404', refus.status === 404, `statut ${refus.status}`)
  } finally {
    if (KEEP) {
      console.log(`\n(KEEP=1 — jeu conservé, membre ${learner.email})`)
      console.log(`cookie membre: ${cookieMembre}`)
    } else {
      const seances = await db.liveSession.findMany({
        where: { communityId: community.id }, select: { id: true },
      })
      await db.liveMessage.deleteMany({ where: { sessionId: { in: seances.map((s) => s.id) } } })
      await db.replay.deleteMany({ where: { communityId: community.id } })
      await db.liveSession.deleteMany({ where: { communityId: community.id } })
      await db.communitySubscription.deleteMany({ where: { communityId: community.id } })
      await db.notification.deleteMany({ where: { userId: { in: [learner.id, trainerUser.id] } } })
      await db.community.delete({ where: { id: community.id } })
      await db.wallet.deleteMany({ where: { trainerId: profile.id } })
      await db.trainerProfile.delete({ where: { id: profile.id } })
      await db.user.deleteMany({ where: { email: { startsWith: marque } } })
    }
  }

  console.log(echecs === 0 ? '\nTout passe.\n' : `\n${echecs} échec(s).\n`)
  await db.$disconnect()
  process.exit(echecs === 0 ? 0 : 1)
}

main().catch(async (err) => {
  console.error(err)
  await db.$disconnect()
  process.exit(1)
})
