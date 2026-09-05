// Smoke test du lot 6 — durée mesurée et cohérence du format (F3.8, F3.9).
//
//   bun scripts/smoke-duree-mesuree.ts
//   KEEP=1 bun scripts/smoke-duree-mesuree.ts   (laisse le jeu de données)
//
// ## Ce que ce test ne fait pas, et pourquoi
//
// Il **ne téléverse rien**. Le `.env` de développement pointe le seau de
// **production** (`AWS_BUCKET_NAME=nkamva-production`) : un smoke test qui
// déposerait un MP4 factice pour vérifier une lecture salirait le stockage des
// clients. La lecture de durée est donc éprouvée ailleurs —
// `tests/mp4-duration.test.ts` sur des fichiers fabriqués, et
// `tests/duree-mesuree.test.ts` sur un stockage simulé — et le seul chemin
// réel qui téléverse reste le seed.
//
// Ce qu'il vérifie ici, contre le serveur de dev : que les écrans ne
// réclament plus ce qui est mesuré, qu'ils rendent ce qui l'a été, et que les
// deux routes refusent bien qu'une fiche et un fichier se contredisent.
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

/** Le texte visible, débarrassé des balises et des marqueurs RSC. */
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
  const marque = `smoke-duree-${Date.now()}`

  const trainerUser = await db.user.create({
    data: { email: `${marque}@nkamva.test`, role: 'TRAINER', fullName: 'Formatrice Durée' },
  })
  const profile = await db.trainerProfile.create({
    data: { userId: trainerUser.id, verifiedLegalName: 'Formatrice Durée', approvedAt: new Date() },
  })
  await db.wallet.create({ data: { trainerId: profile.id, balance: 0 } })

  /** Ce que la confirmation aurait écrit pour un fichier de ce genre. */
  async function ressource(opts: {
    format: string
    mimeType: string | null
    durationSeconds?: number | null
    publiee?: boolean
  }) {
    const suffixe = Math.random().toString(36).slice(2, 8)
    return db.course.create({
      data: {
        trainerId: profile.id,
        slug: `${marque}-${opts.format}-${suffixe}`,
        title: `Ressource ${opts.format} ${suffixe}`,
        blurb: 'Une accroche de recette',
        description: 'Ressource créée par le smoke test du lot 6.',
        category: 'dev',
        format: opts.format,
        priceFcfa: 15_000,
        durationSeconds: opts.durationSeconds ?? null,
        ...(opts.mimeType
          ? {
              contentS3Key: `course-assets/fixture-${suffixe}/content`,
              contentSizeBytes: BigInt(1024),
              contentMimeType: opts.mimeType,
            }
          : {}),
        ...(opts.publiee ? { status: 'published', publishedAt: new Date() } : {}),
      },
    })
  }

  // Une vidéo mesurée à 30 min 30 s, publiée : c'est elle que les écrans
  // doivent annoncer.
  const video = await ressource({
    format: 'video', mimeType: 'video/mp4', durationSeconds: 1_830, publiee: true,
  })
  // Une vidéo dont la durée n'a pas pu être lue : la fiche ne doit rien
  // inventer, et la ressource reste publiable.
  const muette = await ressource({
    format: 'video', mimeType: 'video/mp4', durationSeconds: null, publiee: true,
  })
  // Un kit, livré en archive.
  const kit = await ressource({ format: 'kit', mimeType: 'application/zip' })

  const token = await encode({
    token: {
      userId: trainerUser.id, email: trainerUser.email, role: 'TRAINER',
      adminRole: null, trainerId: profile.id,
      sessionsValidAfter: new Date(0).toISOString(),
      issuedAt: Math.floor(Date.now() / 1000),
    },
    secret: process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production',
  })
  const cookie = `next-auth.session-token=${token}`

  try {
    console.log(`\nLot 6 — durée mesurée et cohérence du format — ${BASE}\n`)

    console.log("1. Le formulaire ne réclame plus ce qu'on peut mesurer")
    const creation = texteDe(
      await (await fetch(`${BASE}/formateur/ressources/nouvelle`, { headers: { cookie } })).text(),
    )
    verifier('la page se rend', creation.includes('Créer le brouillon'))
    verifier('plus de champ « Durée (minutes) »', !creation.includes('Durée (minutes)'))
    verifier('plus de champ « Nombre de leçons »', !creation.includes('Nombre de leçons'))
    verifier('plus de champ « Nombre de sections »', !creation.includes('Nombre de sections'))
    verifier('le formulaire annonce la mesure',
      creation.includes('mesurée sur votre fichier'))

    console.log("\n2. L'écran d'édition rend ce qui a été mesuré")
    const edition = texteDe(
      await (await fetch(`${BASE}/formateur/ressources/${video.id}`, { headers: { cookie } })).text(),
    )
    verifier('la durée mesurée est affichée', edition.includes('Durée mesurée sur votre fichier'))
    // 1 830 s, arrondies à la minute par `fmtDuration`.
    verifier('et vaut bien 31 min', edition.includes('31 min'),
      edition.match(/Durée mesurée sur votre fichier : [^.]*/)?.[0] ?? 'introuvable')
    verifier('le genre déposé est nommé', edition.includes('Vidéo MP4 en place'))
    verifier('le fichier attendu est nommé pour un kit',
      texteDe(
        await (await fetch(`${BASE}/formateur/ressources/${kit.id}`, { headers: { cookie } })).text(),
      ).includes('Archive ZIP en place'))

    console.log("\n3. Une durée illisible ne bloque rien et ne s'invente pas")
    const sansDuree = texteDe(
      await (await fetch(`${BASE}/formateur/ressources/${muette.id}`, { headers: { cookie } })).text(),
    )
    verifier("l'écran le dit franchement", sansDuree.includes("n'a pas pu être lue"))
    verifier('et rappelle que ce n\'est pas bloquant', sansDuree.includes('pas bloquant'))

    console.log('\n4. La fiche publique n\'annonce plus de leçons')
    const fiche = texteDe(
      await (await fetch(`${BASE}/ressources/${video.slug}`)).text(),
    )
    verifier('la fiche se rend', fiche.includes('Ressource video'), fiche.slice(0, 120))
    verifier('la durée mesurée y figure', fiche.includes('31 min'))
    verifier('aucun nombre de leçons', !/\bleçons?\b/.test(fiche),
      fiche.match(/.{40}leçons?.{40}/)?.[0] ?? '')

    console.log('\n5. Le dépôt refuse ce qui contredit la fiche')
    const depot = await fetch(`${BASE}/api/trainer/courses/${video.id}/upload/confirm`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        s3Key: `course-assets/${video.id}/content-test.pdf`,
        kind: 'pdf',
        mimeType: 'application/pdf',
      }),
    })
    const corpsDepot = (await depot.json()) as { error?: { code?: string; message?: string } }
    verifier('un PDF sous une vidéo est refusé en 422', depot.status === 422, `statut ${depot.status}`)
    verifier('avec le bon code', corpsDepot.error?.code === 'CONTENT_FORMAT_MISMATCH',
      corpsDepot.error?.code ?? JSON.stringify(corpsDepot).slice(0, 120))
    verifier('et un message lisible, pas « Erreur »',
      Boolean(corpsDepot.error?.message?.includes('format annoncé')),
      corpsDepot.error?.message ?? '')

    console.log("\n6. Le changement de format ne contourne pas ce refus")
    const patch = await fetch(`${BASE}/api/trainer/courses/${video.id}`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ format: 'pdf' }),
    })
    const corpsPatch = (await patch.json()) as { error?: { code?: string; message?: string } }
    verifier('annoncer un PDF sur une vidéo déposée est refusé en 409',
      patch.status === 409, `statut ${patch.status}`)
    verifier('avec le bon code', corpsPatch.error?.code === 'FORMAT_CONTRADICTS_CONTENT',
      corpsPatch.error?.code ?? '')

    console.log('\n7. Ce qui reste permis le reste')
    // Kit et tableur se livrent tous deux en archive : le mot change, pas le
    // fichier.
    const versTableur = await fetch(`${BASE}/api/trainer/courses/${kit.id}`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ format: 'tableur' }),
    })
    verifier('kit → tableur passe', versTableur.status === 200, `statut ${versTableur.status}`)

    // Et la durée n'est plus modifiable par requête directe : le champ a quitté
    // le schéma de la route.
    const triche = await fetch(`${BASE}/api/trainer/courses/${video.id}`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ durationSeconds: 99_999 }),
    })
    const apres = await db.course.findUnique({ where: { id: video.id } })
    verifier('une durée envoyée à la main est ignorée',
      triche.status === 200 && apres?.durationSeconds === 1_830,
      `statut ${triche.status}, durée ${apres?.durationSeconds}`)
  } finally {
    if (KEEP) {
      console.log(`\n(KEEP=1 — jeu de données conservé, formateur ${trainerUser.email})`)
      console.log(`cookie: ${cookie}`)
    } else {
      await db.course.deleteMany({ where: { trainerId: profile.id } })
      await db.wallet.deleteMany({ where: { trainerId: profile.id } })
      await db.trainerProfile.delete({ where: { id: profile.id } })
      await db.user.delete({ where: { id: trainerUser.id } })
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
