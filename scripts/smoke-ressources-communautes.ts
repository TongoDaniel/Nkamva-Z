// Smoke test du lot 8 — ressources et communautés réunies (F3.10, F3.11).
//
//   bun scripts/smoke-ressources-communautes.ts
//   KEEP=1 bun scripts/smoke-ressources-communautes.ts
//
// Vérifie, contre le serveur de dev, les trois décisions du 5 septembre 2026 :
// la garde à la liaison (arbitrage 136), le sort du circuit à la déliaison et
// à la fermeture (137), et le fait qu'une ressource incluse se retrouve enfin
// dans « Mes ressources », avec un lien vers sa communauté (F3.11).
//
// Il vérifie aussi le point d'entrée qui manquait : un format téléchargeable
// n'offrait que « Télécharger », si bien que le visualiseur du lot 7 et le
// marqueur d'archive n'étaient atteignables par aucun chemin.
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
  const marque = `smoke-rc-${Date.now()}`

  const trainerUser = await db.user.create({
    data: { email: `${marque}-formateur@nkamva.test`, role: 'TRAINER', fullName: 'Formatrice Lien' },
  })
  const profile = await db.trainerProfile.create({
    data: { userId: trainerUser.id, verifiedLegalName: 'Formatrice Lien', approvedAt: new Date() },
  })
  await db.wallet.create({ data: { trainerId: profile.id, balance: 0 } })

  const community = await db.community.create({
    data: {
      trainerId: profile.id, name: 'Cercle des semeurs', slug: `${marque}-cercle`,
      priceFcfa: 5_000, status: 'active', visibility: 'PUBLIC', resourcesEnabled: true,
    },
  })

  async function ressource(format: string, mimeType: string, pageCount?: number) {
    const suffixe = Math.random().toString(36).slice(2, 8)
    return db.course.create({
      data: {
        trainerId: profile.id,
        slug: `${marque}-${format}-${suffixe}`,
        title: `Ressource ${format} ${suffixe}`,
        blurb: 'Une accroche de recette',
        description: 'Ressource créée par le smoke test du lot 8.',
        category: 'dev', format, priceFcfa: 15_000,
        pageCount: pageCount ?? null,
        status: 'published', publishedAt: new Date(),
        contentS3Key: `course-assets/fixture-${suffixe}/content`,
        contentSizeBytes: BigInt(1024), contentMimeType: mimeType,
      },
    })
  }

  // Une incluse (PDF), une achetée (archive) : la liste doit réunir les deux.
  const incluse = await ressource('pdf', 'application/pdf', 24)
  const achetee = await ressource('kit', 'application/zip')

  await db.communityCourse.create({
    data: {
      communityId: community.id, courseId: incluse.id,
      linkedAt: new Date(Date.now() - 40 * JOUR),
    },
  })
  await db.course.update({ where: { id: incluse.id }, data: { circuit: 'COMMUNITY' } })

  const learner = await db.user.create({
    data: { email: `${marque}-apprenant@nkamva.test`, role: 'LEARNER', fullName: 'Apprenant Lien' },
  })
  await db.communitySubscription.create({
    data: {
      communityId: community.id, learnerId: learner.id, status: 'ACTIVE',
      periodStart: new Date(Date.now() - 30 * JOUR),
      periodEnd: new Date(Date.now() + 30 * JOUR),
    },
  })
  await db.purchase.create({
    data: {
      learnerId: learner.id, trainerId: profile.id, courseId: achetee.id,
      amountFcfa: 15_000, commissionRate: 0.15,
      trainerShareFcfa: 12_750, platformShareFcfa: 2_250,
      provider: 'STRIPE', providerStatus: 'SUCCEEDED',
      providerTransactionId: `pi_${Math.random().toString(36).slice(2, 12)}`,
    },
  })

  const jeton = (
    user: { id: string; email: string },
    role: 'LEARNER' | 'TRAINER',
    trainerId: string | null,
  ) =>
    encode({
      token: {
        userId: user.id, email: user.email, role,
        adminRole: null, trainerId,
        sessionsValidAfter: new Date(0).toISOString(),
        issuedAt: Math.floor(Date.now() / 1000),
      },
      secret: process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production',
    })

  const cookieApprenant = `next-auth.session-token=${await jeton(learner, 'LEARNER', null)}`
  const cookieFormateur = `next-auth.session-token=${await jeton(trainerUser, 'TRAINER', profile.id)}`

  const lier = async (courseId: string) => {
    const res = await fetch(`${BASE}/api/trainer/communities/${community.id}/courses`, {
      method: 'POST',
      headers: { cookie: cookieFormateur, 'content-type': 'application/json' },
      body: JSON.stringify({ courseId }),
    })
    return { statut: res.status, corps: (await res.json()) as { error?: { code?: string } } }
  }

  try {
    console.log(`\nLot 8 — ressources et communautés — ${BASE}\n`)

    console.log('1. « Mes ressources » réunit les deux façons d\'y avoir droit')
    const html = await (await fetch(`${BASE}/mes-ressources`, { headers: { cookie: cookieApprenant } })).text()
    const texte = texteDe(html)
    const liens = hrefs(html)

    verifier('la ressource achetée est là', texte.includes(achetee.title))
    // Elle n'y était pas : on ne la retrouvait que par « Mes communautés ».
    verifier("la ressource incluse est là aussi", texte.includes(incluse.title))
    verifier('elle dit de quelle communauté elle vient',
      texte.includes('Incluse dans') && texte.includes('Cercle des semeurs'))
    verifier('et ouvre directement cette communauté',
      liens.includes(`/mes-communautes/${community.slug}`),
      liens.filter((l) => l.includes('communaute')).join(' ') || 'aucun lien')
    // Le chapô nomme encore les deux origines (« vos ressources achetées et
    // celles incluses ») ; c'est la **tuile de comptage** qui devait cesser de
    // dire « achetées », puisqu'elle compte désormais les deux.
    verifier('le compteur dit « acquises »', texte.includes('acquises'))
    verifier('le chapô annonce les deux origines',
      texte.includes('achetées et celles incluses dans vos communautés'))

    console.log('\n2. Le lecteur est atteignable pour tous les formats')
    // Un format téléchargeable n'offrait que « Télécharger » : le visualiseur
    // du lot 7 et le marqueur d'archive n'avaient aucun point d'entrée.
    verifier('un PDF propose la lecture en ligne', texte.includes('Lire en ligne'))
    verifier('une archive propose de l\'ouvrir', texte.includes('Ouvrir'))
    verifier('le téléchargement direct reste proposé', texte.includes('Télécharger'))
    verifier('les deux mènent à leur écran de lecture',
      liens.includes(`/mes-ressources/${incluse.id}`) && liens.includes(`/mes-ressources/${achetee.id}`))

    console.log('\n3. On n\'associe qu\'à une communauté ouverte, rayon allumé')
    const libre = await ressource('pdf', 'application/pdf', 8)

    await db.community.update({ where: { id: community.id }, data: { resourcesEnabled: false } })
    const eteint = await lier(libre.id)
    verifier('rayon éteint : refusé en 409', eteint.statut === 409, `statut ${eteint.statut}`)
    verifier('avec le bon code', eteint.corps.error?.code === 'COMMUNITY_RESOURCES_DISABLED',
      eteint.corps.error?.code ?? '')

    await db.community.update({
      where: { id: community.id },
      data: { resourcesEnabled: true, status: 'closed' },
    })
    const fermee = await lier(libre.id)
    verifier('communauté fermée : refusé en 409', fermee.statut === 409, `statut ${fermee.statut}`)
    verifier('avec le bon code', fermee.corps.error?.code === 'COMMUNITY_CLOSED',
      fermee.corps.error?.code ?? '')

    await db.community.update({ where: { id: community.id }, data: { status: 'active' } })
    const ouverte = await lier(libre.id)
    verifier('ouverte et allumée : accepté', ouverte.statut === 200 || ouverte.statut === 201,
      `statut ${ouverte.statut}`)

    console.log('\n4. Délier range, fermer libère')
    const apresLiaison = await db.course.findUnique({ where: { id: libre.id } })
    verifier('la liaison bascule le circuit', apresLiaison?.circuit === 'COMMUNITY')

    const del = await fetch(`${BASE}/api/trainer/communities/${community.id}/courses`, {
      method: 'DELETE',
      headers: { cookie: cookieFormateur, 'content-type': 'application/json' },
      body: JSON.stringify({ courseId: libre.id }),
    })
    verifier('la déliaison passe', del.status === 200, `statut ${del.status}`)
    const apresDeliaison = await db.course.findUnique({ where: { id: libre.id } })
    // Le code rebasculait en vente, ce que l'arbitrage 53 interdit.
    verifier('délier ne remet pas en vente', apresDeliaison?.circuit === 'COMMUNITY',
      String(apresDeliaison?.circuit))

    const fermeture = await fetch(`${BASE}/api/trainer/communities/${community.id}/closure`, {
      method: 'POST', headers: { cookie: cookieFormateur },
    })
    const corpsFermeture = (await fermeture.json()) as { data?: { releasedCourses?: number } }
    verifier('la fermeture passe', fermeture.status === 200, `statut ${fermeture.status}`)
    verifier('elle libère la ressource encore liée', corpsFermeture.data?.releasedCourses === 1,
      String(corpsFermeture.data?.releasedCourses))
    const apresFermeture = await db.course.findUnique({ where: { id: incluse.id } })
    verifier('qui redevient vendable', apresFermeture?.circuit === 'MARKETPLACE',
      String(apresFermeture?.circuit))

    console.log('\n5. Personne n\'a rien perdu')
    const apres = texteDe(
      await (await fetch(`${BASE}/mes-ressources`, { headers: { cookie: cookieApprenant } })).text(),
    )
    // L'accès se juge sur un chevauchement passé : fermer ne le défait pas.
    verifier('le membre garde la ressource incluse', apres.includes(incluse.title))
    verifier('et son achat', apres.includes(achetee.title))
  } finally {
    if (KEEP) {
      console.log(`\n(KEEP=1 — jeu conservé, apprenant ${learner.email})`)
      console.log(`cookie apprenant: ${cookieApprenant}`)
    } else {
      await db.courseView.deleteMany({ where: { learnerId: learner.id } })
      await db.purchase.deleteMany({ where: { learnerId: learner.id } })
      await db.communityCourse.deleteMany({ where: { communityId: community.id } })
      await db.communitySubscription.deleteMany({ where: { communityId: community.id } })
      await db.community.delete({ where: { id: community.id } })
      await db.course.deleteMany({ where: { trainerId: profile.id } })
      await db.wallet.deleteMany({ where: { trainerId: profile.id } })
      await db.trainerProfile.delete({ where: { id: profile.id } })
      await db.user.deleteMany({ where: { id: { in: [trainerUser.id, learner.id] } } })
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
