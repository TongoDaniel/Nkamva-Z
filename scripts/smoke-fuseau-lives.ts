// Smoke test du fuseau des lignes de live — `hooks/use-reader-time-zone.ts`.
//
//   bun scripts/smoke-fuseau-lives.ts              — vérifie, puis efface ses données
//   KEEP=1 bun scripts/smoke-fuseau-lives.ts       — vérifie, garde les données et
//                                                    imprime le cookie de session
//   CLEAN=<marque> bun scripts/smoke-fuseau-lives.ts — efface ce qu'un KEEP a laissé
//
// **Le serveur doit tourner dans un autre fuseau que Douala** — `TZ=UTC`, comme
// le conteneur de production. Sinon le défaut ne se voit pas : c'est
// précisément parce que serveur et navigateur partageaient le fuseau du poste
// qu'il est passé inaperçu en dev.
//
// Il lit `/mes-lives`, le salon « Sessions » d'une communauté, `/accueil`, la
// salle d'une séance et le lecteur d'un replay tels que le serveur les envoie,
// avant toute hydratation. Ce qu'il tient :
//
//   · une séance s'écrit dans le fuseau de son animateur, jamais dans celui du
//     serveur — le texte que le navigateur hydratera est donc le même ;
//   · une séance sans fuseau prend le repli, `Africa/Douala`, jour compris ;
//   · un replay prend le fuseau de la séance enregistrée, pas le repli ;
//   · le rappel « soit 18:00 à Douala » attend l'hydratation : le serveur ne
//     sait pas s'il diffère du fuseau du lecteur.
//
// L'absence d'erreur d'hydratation, elle, se vérifie au navigateur : ce script
// imprime le cookie avec KEEP=1.

import { config } from 'dotenv'
import { encode } from 'next-auth/jwt'
import { PrismaClient } from '@prisma/client'

config()

const db = new PrismaClient()
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000'
const SECRET = process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production'
const KEEP = process.env.KEEP === '1'
const JOUR = 24 * 3_600_000

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
    .replace(/&nbsp;| | /g, ' ')
    .replace(/\s+/g, ' ')
}

/** Un instant fixé en UTC, `decalage` jours après aujourd'hui. */
function utc(decalage: number, heure: number, minute = 0) {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + decalage, heure, minute))
}

/** Ce que la ligne doit écrire, calculé dans un fuseau explicite — jamais celui de ce script. */
function attendu(date: Date, timeZone: string) {
  const f = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('fr-FR', { ...o, timeZone }).format(date).replace('.', '')
  return {
    jour: f({ day: 'numeric' }),
    semaine: f({ weekday: 'short' }),
    mois: f({ month: 'short' }),
    heure: f({ hour: '2-digit', minute: '2-digit' }),
  }
}

async function nettoyer(marque: string) {
  const users = await db.user.findMany({ where: { email: { startsWith: marque } }, select: { id: true } })
  const ids = users.map((u) => u.id)
  const profiles = await db.trainerProfile.findMany({ where: { userId: { in: ids } }, select: { id: true } })
  const pids = profiles.map((p) => p.id)
  // Le replay retient le formateur (`onDelete: Restrict`) : il part en premier.
  await db.replay.deleteMany({ where: { trainerId: { in: pids } } })
  await db.liveSession.deleteMany({ where: { trainerId: { in: pids } } })
  await db.communitySubscription.deleteMany({
    where: { OR: [{ learnerId: { in: ids } }, { community: { trainerId: { in: pids } } }] },
  })
  await db.community.deleteMany({ where: { trainerId: { in: pids } } })
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

  const marque = `smoke-fuseau-${Date.now()}`
  const now = Date.now()

  const formatriceUser = await db.user.create({
    data: { email: `${marque}-formatrice@nkamva.test`, role: 'TRAINER', fullName: 'Awa Fuseau' },
  })
  const formatrice = await db.trainerProfile.create({
    data: { userId: formatriceUser.id, approvedAt: new Date(now - 90 * JOUR), slogan: 'Montage vidéo' },
  })
  // Ressources fermées : le salon s'ouvre alors sur « Sessions », et ses lignes
  // sont dans le HTML du serveur au lieu d'attendre un clic.
  const communaute = await db.community.create({
    data: {
      trainerId: formatrice.id, name: 'Atelier Fuseau', slug: `${marque}-atelier`,
      priceFcfa: 4_000, status: 'active', visibility: 'PUBLIC',
      eventsEnabled: true, resourcesEnabled: false,
    },
  })
  const membre = await db.user.create({
    data: { email: `${marque}-membre@nkamva.test`, role: 'LEARNER', fullName: 'Koffi Fuseau' },
  })
  await db.communitySubscription.create({
    data: {
      communityId: communaute.id, learnerId: membre.id, status: 'ACTIVE',
      periodStart: new Date(now - 30 * JOUR), periodEnd: new Date(now + 30 * JOUR),
    },
  })

  const seance = (title: string, debut: Date, timeZone: string | null, status: 'SCHEDULED' | 'ENDED' = 'SCHEDULED') =>
    db.liveSession.create({
      data: {
        communityId: communaute.id, trainerId: formatrice.id, title, status,
        scheduledStartAt: debut, durationMinutes: 90, timeZone,
        roomName: `${marque}-${Math.random().toString(36).slice(2, 10)}`,
      },
    })

  // 17:00 UTC : 18:00 à Douala, 19:00 à Paris — trois textes pour un instant.
  const debutDouala = utc(1, 17)
  const seanceDouala = await seance('Séance Fuseau Douala', debutDouala, 'Africa/Douala')
  // 23:30 UTC sans fuseau : le repli la place le lendemain, à 00:30 — le jour
  // change aussi, pas seulement l'heure.
  const debutSansFuseau = utc(2, 23, 30)
  const seanceSansFuseau = await seance('Séance Fuseau Absent', debutSansFuseau, null)
  // 02:00 UTC à Toronto : la veille au soir. Le repli (Douala) dirait le même
  // jour qu'UTC ; seul le fuseau de la séance donne la veille.
  const debutToronto = utc(-3, 2)
  const passee = await seance('Séance Fuseau Toronto', debutToronto, 'America/Toronto', 'ENDED')
  const replay = await db.replay.create({
    data: {
      sessionId: passee.id, communityId: communaute.id, trainerId: formatrice.id,
      title: 'Replay Fuseau Toronto', recordedAt: debutToronto, durationSeconds: 3_600,
      status: 'READY', purgeAt: new Date(now + 700 * JOUR),
    },
  })

  const cookie = `next-auth.session-token=${await encode({
    token: {
      userId: membre.id, email: membre.email, role: membre.role, adminRole: null, trainerId: null,
      sessionsValidAfter: new Date(0).toISOString(), issuedAt: Math.floor(Date.now() / 1000),
    },
    secret: SECRET,
  })}`

  const lire = async (chemin: string) => {
    const res = await fetch(`${BASE}${chemin}`, { headers: { cookie }, redirect: 'manual' })
    const html = res.status === 200 ? await res.text() : ''
    return { status: res.status, html, texte: texteDe(html) }
  }

  /** Le libellé d'un jour marqué du calendrier : « 16 septembre 2026 ». */
  const jourLong = (date: Date, timeZone: string) =>
    new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(date)

  const douala = attendu(debutDouala, 'Africa/Douala')
  const serveurUtc = attendu(debutDouala, 'UTC')
  const repli = attendu(debutSansFuseau, 'Africa/Douala')
  const toronto = attendu(debutToronto, 'America/Toronto')
  const torontoRepli = attendu(debutToronto, 'Africa/Douala')

  /** Le bloc de date précède le titre : « 14 lun Séance … · 18:00 · 90 min ». */
  const ligne = (texte: string, titre: string) =>
    texte.match(new RegExp(`(\\d{1,2}) (\\S+) ${titre}[^·]*(?:·[^·]*)?· (\\d\\d:\\d\\d) · 90 min`))
  const ligneReplay = (texte: string) => texte.match(/(\d{1,2}) (\S+) Replay Fuseau Toronto/)

  try {
    console.log(`\nFuseau des lignes de live — ${BASE}\n`)

    // `/mes-lives` ne rend que l'onglet ouvert : les replays n'y sont dans le
    // HTML du serveur que sous `?onglet=replays`. Le salon rend les deux listes.
    for (const [nom, chemin, cheminReplays] of [
      ['/mes-lives', '/mes-lives', '/mes-lives?onglet=replays'],
      ['salon « Sessions »', `/mes-communautes/${communaute.slug}`, null],
    ] as const) {
      console.log(nom)
      const page = await lire(chemin)
      verifier('la page répond', page.status === 200, `HTTP ${page.status}`)
      const replays = cheminReplays ? await lire(cheminReplays) : page

      const a = ligne(page.texte, 'Séance Fuseau Douala')
      verifier(`la séance de Douala s'écrit à ${douala.heure}, pas à ${serveurUtc.heure} (UTC)`,
        a?.[3] === douala.heure, a?.[0] ?? 'ligne introuvable')
      verifier(`son bloc de date dit ${douala.jour} ${douala.semaine}`,
        a?.[1] === douala.jour && a?.[2] === douala.semaine, a?.[0])

      const b = ligne(page.texte, 'Séance Fuseau Absent')
      verifier(`la séance sans fuseau prend le repli : ${repli.jour} ${repli.semaine}, ${repli.heure}`,
        b?.[1] === repli.jour && b?.[2] === repli.semaine && b?.[3] === repli.heure, b?.[0] ?? 'ligne introuvable')

      const r = ligneReplay(replays.texte)
      verifier(`le replay prend le fuseau de sa séance : ${toronto.jour} ${toronto.mois}, pas ${torontoRepli.jour}`,
        r?.[1] === toronto.jour && r?.[2] === toronto.mois, r?.[0] ?? 'ligne introuvable')

      verifier('le rappel « soit … à Douala » attend l’hydratation', !/soit \d\d:\d\d à/.test(page.texte))

      // Le calendrier n'existe que sur `/mes-lives`. Il rangeait les séances par
      // `getDate()`, dans le fuseau du serveur : 23:30 UTC marquait la veille,
      // et le navigateur, le lendemain — React jetait alors tout le rendu serveur.
      if (cheminReplays) {
        const attenduJour = `aria-label="${jourLong(debutSansFuseau, 'Africa/Douala')} — un live de vos communautés"`
        const jourServeur = `aria-label="${jourLong(debutSansFuseau, 'UTC')} — un live de vos communautés"`
        verifier(`le calendrier marque ${jourLong(debutSansFuseau, 'Africa/Douala')}, pas ${jourLong(debutSansFuseau, 'UTC')}`,
          page.html.includes(attenduJour) && !page.html.includes(jourServeur),
          page.html.match(/aria-label="[^"]*— un live de vos communautés"/g)?.join(' | '))
      }
      console.log('')
    }

    console.log('/accueil')
    const accueil = await lire('/accueil')
    verifier('la page répond', accueil.status === 200, `HTTP ${accueil.status}`)
    verifier(`l'événement s'écrit à ${douala.heure}, comme avant le partage du hook`,
      new RegExp(`Séance Fuseau Douala[\\s\\S]{0,120}${douala.heure} · 90 min`).test(accueil.texte),
      accueil.texte.match(/Séance Fuseau Douala.{0,120}/)?.[0])

    // La salle et le lecteur écrivaient leur date sans fuseau : celui du
    // serveur au premier rendu, celui du lecteur à l'hydratation. On ne compare
    // que le jour et l'heure — la mise en forme complète (« à », virgule) peut
    // différer entre l'ICU de ce script et celui du serveur.
    console.log('\nsalle d’une séance')
    const salle = await lire(`/mes-lives/live/${seanceDouala.id}`)
    verifier('la page répond', salle.status === 200, `HTTP ${salle.status}`)
    const entete = (texte: string) => texte.match(/animé par Awa Fuseau · (\S+ (\d{1,2}) \S+\D*(\d\d:\d\d))/)
    const s = entete(salle.texte)
    verifier(`la séance de Douala s'écrit le ${douala.jour} à ${douala.heure}, pas à ${serveurUtc.heure} (UTC)`,
      s?.[2] === douala.jour && s?.[3] === douala.heure, s?.[1] ?? 'en-tête introuvable')
    verifier('le rappel « soit … à Douala » attend l’hydratation', !/soit \d\d:\d\d à/.test(salle.texte))

    const salleRepli = await lire(`/mes-lives/live/${seanceSansFuseau.id}`)
    const sr = entete(salleRepli.texte)
    verifier(`la séance sans fuseau prend le repli : le ${repli.jour} à ${repli.heure}`,
      sr?.[2] === repli.jour && sr?.[3] === repli.heure, sr?.[1] ?? 'en-tête introuvable')

    console.log('\nlecteur de replay')
    const lecteur = await lire(`/mes-lives/replay/${replay.id}`)
    verifier('la page répond', lecteur.status === 200, `HTTP ${lecteur.status}`)
    const enregistre = lecteur.texte.match(/enregistré le (\d{1,2} \S+ \d{4})/)
    verifier(`l'enregistrement date du ${jourLong(debutToronto, 'America/Toronto')}, pas du ${jourLong(debutToronto, 'UTC')}`,
      enregistre?.[1] === jourLong(debutToronto, 'America/Toronto'), enregistre?.[0] ?? 'date introuvable')
  } finally {
    if (KEEP) {
      console.log(`\n  KEEP=1 — données conservées sous la marque ${marque}`)
      console.log(`  communauté : /mes-communautes/${communaute.slug}`)
      console.log(`  salle      : /mes-lives/live/${seanceDouala.id}`)
      console.log(`  replay     : /mes-lives/replay/${replay.id}`)
      console.log(`  membre     : ${cookie}`)
      console.log(`  pour effacer : CLEAN=${marque} bun scripts/smoke-fuseau-lives.ts`)
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
