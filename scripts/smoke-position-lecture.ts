// Smoke test du lot 7 — position de lecture par format (F3), contre le dev.
//
//   bun scripts/smoke-position-lecture.ts
//   KEEP=1 bun scripts/smoke-position-lecture.ts   (laisse le jeu de données)
//
// ## Ce que ce test ne fait pas, et pourquoi
//
// Il **ne téléverse rien** — le `.env` de développement pointe le seau de
// production. Le visualiseur PDF a donc été éprouvé séparément, au navigateur,
// sur un document servi par le serveur de dev : reprise à la bonne page,
// changement de page au défilement, dessin paresseux, boutons et zoom. Ce qui
// se vérifie ici est le reste de la chaîne : ce que rendent les écrans selon
// le format, et ce que la route de position accepte ou refuse.
//
// L'écran de lecture n'a **pas** de contenu à charger dans ce jeu de données
// (aucune clé réelle), et c'est sans importance : les trois rendus se
// distinguent avant même la réponse du stockage.
import { config } from 'dotenv'
import { encode } from 'next-auth/jwt'
import { PrismaClient } from '@prisma/client'

config()

const db = new PrismaClient()
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000'
const KEEP = process.env.KEEP === '1'

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

async function main() {
  const marque = `smoke-position-${Date.now()}`

  const trainerUser = await db.user.create({
    data: { email: `${marque}-formateur@nkamva.test`, role: 'TRAINER', fullName: 'Formatrice Position' },
  })
  const profile = await db.trainerProfile.create({
    data: { userId: trainerUser.id, verifiedLegalName: 'Formatrice Position', approvedAt: new Date() },
  })
  await db.wallet.create({ data: { trainerId: profile.id, balance: 0 } })

  const learner = await db.user.create({
    data: { email: `${marque}-apprenant@nkamva.test`, role: 'LEARNER', fullName: 'Apprenant Position' },
  })

  async function ressourceAchetee(opts: {
    format: string
    mimeType: string
    durationSeconds?: number | null
    pageCount?: number | null
  }) {
    const suffixe = Math.random().toString(36).slice(2, 8)
    const course = await db.course.create({
      data: {
        trainerId: profile.id,
        slug: `${marque}-${opts.format}-${suffixe}`,
        title: `Ressource ${opts.format} ${suffixe}`,
        blurb: 'Une accroche de recette',
        description: 'Ressource créée par le smoke test du lot 7.',
        category: 'dev',
        format: opts.format,
        priceFcfa: 15_000,
        durationSeconds: opts.durationSeconds ?? null,
        pageCount: opts.pageCount ?? null,
        status: 'published',
        publishedAt: new Date(),
        contentS3Key: `course-assets/fixture-${suffixe}/content`,
        contentSizeBytes: BigInt(1024),
        contentMimeType: opts.mimeType,
      },
    })
    await db.purchase.create({
      data: {
        learnerId: learner.id, trainerId: profile.id, courseId: course.id,
        amountFcfa: 15_000, commissionRate: 0.15,
        trainerShareFcfa: 12_750, platformShareFcfa: 2_250,
        provider: 'STRIPE', providerStatus: 'SUCCEEDED',
        providerTransactionId: `pi_${Math.random().toString(36).slice(2, 12)}`,
      },
    })
    return course
  }

  const video = await ressourceAchetee({ format: 'video', mimeType: 'video/mp4', durationSeconds: 3_600 })
  const pdf = await ressourceAchetee({ format: 'pdf', mimeType: 'application/pdf', pageCount: 24 })
  const kit = await ressourceAchetee({ format: 'kit', mimeType: 'application/zip' })

  const token = await encode({
    token: {
      userId: learner.id, email: learner.email, role: 'LEARNER',
      adminRole: null, trainerId: null,
      sessionsValidAfter: new Date(0).toISOString(),
      issuedAt: Math.floor(Date.now() / 1000),
    },
    secret: process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production',
  })
  const cookie = `next-auth.session-token=${token}`

  const lire = async (chemin: string) =>
    (await fetch(`${BASE}${chemin}`, { headers: { cookie } })).text()

  const position = async (courseId: string, corps: Record<string, unknown>) => {
    const res = await fetch(`${BASE}/api/me/resources/${courseId}/progress`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(corps),
    })
    return { statut: res.status, corps: (await res.json()) as { error?: { code?: string } } }
  }

  try {
    console.log(`\nLot 7 — position de lecture — ${BASE}\n`)

    console.log('1. Chaque format a le rendu qui lui correspond')
    // La balise `<video>` et le lien de téléchargement n'apparaissent qu'une
    // fois l'URL signée revenue, côté navigateur. Le rendu serveur montre le
    // **cadre** propre à chaque format, et c'est lui qui distingue les trois.
    const htmlVideo = await lire(`/mes-ressources/${video.id}`)
    verifier('une vidéo garde le cadre du lecteur vidéo', htmlVideo.includes('aspect-video'))

    const htmlPdf = await lire(`/mes-ressources/${pdf.id}`)
    // C'est le défaut de l'audit : un document rendu dans une balise `<video>`,
    // écran noir et rien de mesurable.
    verifier('un document ne passe plus par un lecteur vidéo',
      !htmlPdf.includes('<video') && !htmlPdf.includes('aspect-video'))
    verifier('il annonce le chargement du visualiseur',
      texteDe(htmlPdf).includes('Chargement du'), texteDe(htmlPdf).slice(0, 160))

    const htmlKit = await lire(`/mes-ressources/${kit.id}`)
    const texteKit = texteDe(htmlKit)
    verifier('une archive ne passe pas non plus par un lecteur vidéo',
      !htmlKit.includes('<video') && !htmlKit.includes('aspect-video'))
    verifier('elle se présente comme un téléchargement',
      texteKit.includes('Ressource à télécharger'))
    verifier('et le marqueur « terminée »', texteKit.includes('Marquer comme terminée'))
    verifier('en disant qui le pose', texteKit.includes("c'est vous qui posez ce repère"))

    console.log("\n2. La route de position accepte l'unité du format")
    verifier('une seconde passe', (await position(video.id, { watchedSeconds: 900 })).statut === 200)
    verifier('une page passe', (await position(pdf.id, { lastPage: 12 })).statut === 200)
    verifier('un marqueur passe', (await position(kit.id, { completed: true })).statut === 200)

    const vues = await db.courseView.findMany({ where: { learnerId: learner.id } })
    const parCours = new Map(vues.map((v) => [v.courseId, v]))
    verifier('la seconde est enregistrée', parCours.get(video.id)?.watchedSeconds === 900)
    verifier('la page est enregistrée', parCours.get(pdf.id)?.lastPage === 12)
    verifier('le marqueur est enregistré', parCours.get(kit.id)?.completedAt !== null)

    console.log('\n3. Les bornes viennent du serveur, pas du navigateur')
    await position(video.id, { watchedSeconds: 86_400 })
    await position(pdf.id, { lastPage: 99_999 })
    const bornees = await db.courseView.findMany({ where: { learnerId: learner.id } })
    const bornee = new Map(bornees.map((v) => [v.courseId, v]))
    // Sans borne, un nombre venu du navigateur pesait sur le seuil des 30 %
    // qui décide d'un remboursement.
    verifier('la seconde est ramenée à la durée', bornee.get(video.id)?.watchedSeconds === 3_600,
      String(bornee.get(video.id)?.watchedSeconds))
    verifier('la page est ramenée au total', bornee.get(pdf.id)?.lastPage === 24,
      String(bornee.get(pdf.id)?.lastPage))

    console.log('\n4. Maximum pour la vidéo, dernière page pour le document')
    await position(video.id, { watchedSeconds: 30 })
    await position(pdf.id, { lastPage: 3 })
    const apres = new Map(
      (await db.courseView.findMany({ where: { learnerId: learner.id } })).map((v) => [v.courseId, v]),
    )
    verifier('la vidéo garde son maximum', apres.get(video.id)?.watchedSeconds === 3_600)
    verifier('le document garde sa dernière page', apres.get(pdf.id)?.lastPage === 3)

    console.log('\n5. Ce que la route refuse')
    const vide = await position(pdf.id, {})
    verifier('un corps vide est refusé', vide.statut === 400, `statut ${vide.statut}`)
    const inconnu = await position(pdf.id, { pageActuelle: 4 })
    verifier('un champ inconnu est refusé', inconnu.statut === 400, `statut ${inconnu.statut}`)

    console.log('\n6. La liste des ressources dit où reprendre')
    const liste = texteDe(await lire('/mes-ressources'))
    verifier('elle propose de reprendre la vidéo', liste.includes('Reprendre à'), liste.slice(0, 200))
    verifier('et de reprendre le document à sa page',
      liste.includes('Reprendre page 3 sur 24'),
      liste.match(/Reprendre page[^·]{0,30}/)?.[0] ?? 'introuvable')
    verifier('le document annonce son nombre de pages', liste.includes('24 pages'))
    verifier("l'archive est dite terminée", liste.includes('Marquée comme terminée'))

    console.log("\n7. L'écran de lecture reprend là où on s'est arrêté")
    const reprise = texteDe(await lire(`/mes-ressources/${pdf.id}`))
    verifier('il annonce la page 3 sur 24', reprise.includes('Page 3') && reprise.includes('sur 24'),
      reprise.match(/Page \d+[^A-Z]{0,20}/)?.[0] ?? 'introuvable')

    const repriseKit = texteDe(await lire(`/mes-ressources/${kit.id}`))
    verifier("l'archive marquée propose de retirer le marqueur",
      repriseKit.includes('Retirer « terminé »'))
  } finally {
    if (KEEP) {
      console.log(`\n(KEEP=1 — jeu de données conservé, apprenant ${learner.email})`)
      console.log(`cookie: ${cookie}`)
    } else {
      await db.courseView.deleteMany({ where: { learnerId: learner.id } })
      await db.purchase.deleteMany({ where: { learnerId: learner.id } })
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
