/**
 * Vérification du signalement, de bout en bout.
 *
 *   bun run dev                        # dans un autre terminal
 *   bun scripts/smoke-signalements.ts
 *
 * Ce script existe parce que chaque maillon de cette chaîne était vert
 * séparément — `createReport` testé, la route testée, la file d'instruction
 * rendue — et que la chaîne, elle, était coupée : aucun écran ne postait. Il
 * contrôle donc les jointures, pas les pièces :
 *
 *   1. le bouton est bien **rendu** sur les surfaces annoncées ;
 *   2. un signalement posté par un apprenant **arrive** en modération ;
 *   3. les refus attendus refusent (doublon, anonyme).
 *
 * Le signalement créé est supprimé à la fin, y compris en cas d'échec. Son
 * entrée au journal d'audit, elle, reste : le journal est en ajout seul, et
 * c'est très bien ainsi — mieux vaut une trace orpheline qu'un journal qu'on
 * sait retoucher.
 */
import { encode } from 'next-auth/jwt'
import { db } from '../src/lib/db'

const BASE = 'http://localhost:3000'
const SECRET = process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production'
const mail = (key: string) => `tongodanielfo+${key}@gmail.com`

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`✓ ${label}`)
  else {
    failures++
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

async function cookieFor(email: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({
    where: { email },
    select: {
      id: true, email: true, role: true, adminRole: true, sessionsValidAfter: true,
      trainerProfile: { select: { id: true } },
    },
  })
  const token = await encode({
    token: {
      userId: user.id,
      role: user.role,
      adminRole: user.adminRole,
      trainerId: user.trainerProfile?.id ?? null,
      sessionsValidAfter: user.sessionsValidAfter.toISOString(),
      issuedAt: Math.floor(Date.now() / 1000),
      sub: user.id,
      email: user.email,
    },
    secret: SECRET,
  })
  return `next-auth.session-token=${token}`
}

/** React coupe les textes interpolés par un commentaire vide. */
const readable = (page: string) => page.replaceAll('<!-- -->', '').replaceAll('&#x27;', "'")

async function main() {
  const course = await db.course.findFirstOrThrow({
    where: { status: 'published' },
    select: { id: true, slug: true, title: true },
  })
  const community = await db.community.findFirst({ select: { id: true, slug: true, name: true } })
  const learner = await db.user.findUniqueOrThrow({
    where: { email: mail('aminata') },
    select: { id: true },
  })
  const created: string[] = []

  try {
    // ---- 1. Le bouton est rendu ----------------------------------------
    //
    // Les deux espaces partagent le même corps de page (`CourseScreen`), mais
    // ce sont deux URLs : les vérifier tous les deux est le seul moyen de
    // savoir que la coquille connectée n'avale pas le composant.
    for (const path of [`/ressources/${course.slug}`, `/catalogue/ressource/${course.slug}`]) {
      const html = readable(await (await fetch(`${BASE}${path}`, {
        headers: { cookie: await cookieFor(mail('aminata')) },
      })).text())
      check(
        `${path} affiche « Signaler cette ressource »`,
        html.includes('Signaler cette ressource') && !html.includes('Une erreur est survenue'),
      )
    }

    if (community) {
      const html = readable(
        await (await fetch(`${BASE}/communautes/${community.slug}`)).text(),
      )
      check(
        `/communautes/${community.slug} affiche « Signaler cette communauté »`,
        html.includes('Signaler cette communauté'),
      )
    }

    // ---- 2. Un signalement arrive en modération ------------------------
    const learnerCookie = await cookieFor(mail('aminata'))
    const post = (body: unknown, cookie?: string) =>
      fetch(`${BASE}/api/reports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body),
      })

    const payload = {
      targetType: 'COURSE',
      targetId: course.id,
      reason: 'MISLEADING',
      detail: 'Contrôle automatique — smoke-signalements.',
    }

    const res = await post(payload, learnerCookie)
    const created201 = (await res.json()) as { data?: { id?: string } }
    if (created201.data?.id) created.push(created201.data.id)
    check(
      'POST /api/reports — 201 pour un apprenant connecté',
      res.status === 201 && Boolean(created201.data?.id),
      `reçu ${res.status}`,
    )

    // C'est le contrôle qui manquait : le signalement doit être **instruisible**,
    // pas seulement enregistré.
    const inQueue = await db.report.findFirst({
      where: { reporterId: learner.id, targetId: course.id, status: 'OPEN' },
      select: { id: true, reason: true, detail: true },
    })
    check(
      'le signalement est en base, ouvert, avec son motif et sa précision',
      inQueue?.reason === 'MISLEADING' && inQueue.detail?.includes('smoke-signalements') === true,
    )

    const moderation = await cookieFor(mail('moderation'))
    const queue = readable(
      await (await fetch(`${BASE}/admin/signalements`, { headers: { cookie: moderation } })).text(),
    )
    check(
      '/admin/signalements liste le signalement à instruire',
      inQueue !== null && queue.includes(inQueue.id.slice(0, 8)),
      'la file ne montre pas le signalement fraîchement créé',
    )
    if (inQueue) {
      const detailPage = readable(
        await (
          await fetch(`${BASE}/admin/signalements/${inQueue.id}`, { headers: { cookie: moderation } })
        ).text(),
      )
      check(
        "l'écran d'instruction rend le signalement et sa cible",
        detailPage.includes('smoke-signalements') && detailPage.includes(course.title),
      )
    }

    // ---- 3. Les refus attendus refusent -------------------------------
    const duplicate = await post(payload, learnerCookie)
    const duplicateBody = (await duplicate.json()) as { error?: { code?: string; message?: string } }
    check(
      'un second signalement du même objet est refusé en 409',
      duplicate.status === 409 && duplicateBody.error?.code === 'REPORT_ALREADY_OPEN',
      `reçu ${duplicate.status} ${JSON.stringify(duplicateBody)}`,
    )
    check(
      'le refus porte un message affichable tel quel par le bouton',
      (duplicateBody.error?.message ?? '').includes('déjà signalé'),
      `message reçu : ${duplicateBody.error?.message}`,
    )

    const anonymous = await post(payload)
    check(
      'un visiteur non connecté est refusé en 401',
      anonymous.status === 401,
      `reçu ${anonymous.status}`,
    )

    const badTarget = await post({ ...payload, targetId: 'pas-un-uuid' }, learnerCookie)
    check(
      'un identifiant de cible malformé est refusé en 422',
      badTarget.status === 422 || badTarget.status === 400,
      `reçu ${badTarget.status}`,
    )
  } finally {
    for (const id of created) {
      await db.report.deleteMany({ where: { id } })
    }
    // Le doublon n'a rien créé, mais un contrôle interrompu au mauvais endroit
    // peut laisser une trace : on nettoie sur le motif, pas sur la seule liste.
    await db.report.deleteMany({
      where: { detail: { contains: 'smoke-signalements' } },
    })
    console.log('\nSignalements de contrôle supprimés.')
  }

  console.log(failures ? `\n${failures} contrôle(s) en échec.` : '\nChaîne du signalement complète.')
  if (failures) process.exitCode = 1
}

main().finally(() => db.$disconnect())
