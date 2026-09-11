// Mesure des latences de navigation, route par route.
//
//   bun scripts/mesure-latences.ts [--samples 7] [--json chemin.json]
//
// Ce qu'on mesure, et pourquoi ainsi
// ----------------------------------
// Une navigation App Router ne récupère pas le document HTML : elle demande la
// charge RSC de la route (en-tête `RSC: 1`). C'est cette requête-là qui fait
// patienter, et c'est donc elle qu'on chronomètre — le HTML complet, lui,
// n'arrive qu'au premier chargement de l'application.
//
// Toutes les pages étant en `force-dynamic`, il n'y a pas de cache à réchauffer
// côté rendu : ce qu'on mesure est le temps de rendu serveur, dominé par les
// requêtes en base. En revanche, en `next dev`, la **première** requête sur une
// route la compile — d'où les tirs à blanc, écartés, avant les tirs comptés.
//
// Les valeurs absolues restent supérieures à ce que donnerait un build de
// production. La part qui décide de la pose d'un `loading.tsx` — le nombre et
// le coût des requêtes en base — est la même dans les deux cas, et c'est le
// classement relatif qui sert à trancher.
import { config } from 'dotenv'
import { encode } from 'next-auth/jwt'
import { PrismaClient } from '@prisma/client'
import { writeFileSync } from 'node:fs'

config()

const db = new PrismaClient()
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000'
const SECRET = process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production'

const args = process.argv.slice(2)
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const SAMPLES = Number.parseInt(flag('samples', '7'), 10)
const WARMUPS = 2
const JSON_OUT = args.indexOf('--json') >= 0 ? flag('json', 'latences.json') : null

type Persona = 'visiteur' | 'apprenant' | 'formateur' | 'admin'

interface Measure {
  route: string
  persona: Persona
  status: number
  median: number
  p90: number
  min: number
  bytes: number
}

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function percentile(values: number[], p: number) {
  const s = [...values].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]
}

async function sessionCookie(userId: string, extra: Record<string, unknown>) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, adminRole: true, sessionsValidAfter: true },
  })
  if (!user) throw new Error(`utilisateur ${userId} absent`)
  const token = await encode({
    token: {
      userId: user.id,
      email: user.email,
      role: user.role,
      adminRole: user.adminRole,
      sessionsValidAfter: user.sessionsValidAfter.toISOString(),
      issuedAt: Math.floor(Date.now() / 1000),
      trainerId: null,
      ...extra,
    },
    secret: SECRET,
  })
  return `next-auth.session-token=${token}`
}

/** Un tir : durée totale jusqu'à la charge RSC complète. */
async function hit(path: string, cookie: string | null) {
  const started = performance.now()
  const res = await fetch(`${BASE}${path}`, {
    headers: { RSC: '1', ...(cookie ? { cookie } : {}) },
    redirect: 'manual',
  })
  const body = await res.arrayBuffer()
  return { ms: performance.now() - started, status: res.status, bytes: body.byteLength }
}

async function measure(route: string, persona: Persona, cookie: string | null): Promise<Measure> {
  // Tirs à blanc : ils absorbent la compilation Turbopack de la route.
  let last = { status: 0, bytes: 0 }
  for (let i = 0; i < WARMUPS; i++) last = await hit(route, cookie)

  const times: number[] = []
  for (let i = 0; i < SAMPLES; i++) {
    const r = await hit(route, cookie)
    times.push(r.ms)
    last = r
  }
  return {
    route,
    persona,
    status: last.status,
    median: Math.round(median(times)),
    p90: Math.round(percentile(times, 90)),
    min: Math.round(Math.min(...times)),
    bytes: last.bytes,
  }
}

async function main() {
  // ---- Échantillons réels, pour que les routes paramétrées mesurent quelque chose
  const trainer = await db.user.findFirst({
    where: { trainerProfile: { isNot: null }, deletedAt: null, suspendedAt: null },
    select: { id: true, trainerProfile: { select: { id: true } } },
  })
  const admin = await db.user.findFirst({
    where: { role: 'ADMIN', deletedAt: null, suspendedAt: null },
    select: { id: true },
  })
  const learner = await db.user.findFirst({
    where: { role: 'LEARNER', deletedAt: null, suspendedAt: null },
    select: { id: true },
  })
  if (!trainer?.trainerProfile || !admin || !learner) {
    throw new Error('base de dev incomplète : il faut un formateur, un admin et un apprenant')
  }

  const [course, community, dispute, payout, report, application, payoutMethod] = await Promise.all([
    db.course.findFirst({ where: { status: 'published' }, select: { id: true, slug: true } }),
    db.community.findFirst({ select: { slug: true } }),
    db.dispute.findFirst({ select: { id: true } }),
    db.payout.findFirst({ select: { id: true } }),
    db.report.findFirst({ select: { id: true } }),
    db.trainerApplication.findFirst({ select: { id: true } }),
    db.payoutMethod.findFirst({ select: { id: true } }),
  ])

  const trainerCourse = await db.course.findFirst({
    where: { trainerId: trainer.trainerProfile.id },
    select: { id: true },
  })

  // `undefined` = on saute la route, faute d'échantillon en base.
  const routes: Array<[Persona, string | null | undefined]> = [
    // ---- Visiteur
    ['visiteur', '/'],
    ['visiteur', '/ressources'],
    ['visiteur', '/communautes'],
    ['visiteur', '/formateurs'],
    ['visiteur', '/recherche?q=react'],
    ['visiteur', '/tarifs'],
    ['visiteur', '/aide'],
    ['visiteur', course && `/ressources/${course.slug}`],
    ['visiteur', community && `/communautes/${community.slug}`],

    // ---- Apprenant
    ['apprenant', '/accueil'],
    ['apprenant', '/catalogue'],
    ['apprenant', '/catalogue?category=Developpement&sort=popular'],
    ['apprenant', '/catalogue/formateurs'],
    ['apprenant', '/mes-ressources'],
    ['apprenant', '/mes-communautes'],
    ['apprenant', '/mes-achats'],
    ['apprenant', '/mes-factures'],
    ['apprenant', '/mes-lives'],
    ['apprenant', '/mes-litiges'],
    ['apprenant', '/favoris'],
    ['apprenant', '/notifications'],
    ['apprenant', '/messagerie'],
    ['apprenant', '/profil'],
    ['apprenant', course && `/catalogue/ressource/${course.slug}`],
    ['apprenant', community && `/mes-communautes/${community.slug}`],

    // ---- Formateur
    ['formateur', '/formateur'],
    ['formateur', '/formateur/ressources'],
    ['formateur', '/formateur/communaute'],
    ['formateur', '/formateur/portefeuille'],
    ['formateur', '/formateur/litiges'],
    ['formateur', '/formateur/lives'],
    ['formateur', trainerCourse && `/formateur/ressources/${trainerCourse.id}`],
    ['formateur', '/formateur/ressources/nouvelle'],

    // ---- Admin
    ['admin', '/admin'],
    ['admin', '/admin/utilisateurs'],
    ['admin', '/admin/transactions'],
    ['admin', '/admin/litiges'],
    ['admin', '/admin/retraits'],
    ['admin', '/admin/signalements'],
    ['admin', '/admin/validation-formateurs'],
    ['admin', '/admin/moyens-de-paiement'],
    ['admin', '/admin/portefeuilles'],
    ['admin', '/admin/abonnements'],
    ['admin', '/admin/remboursements'],
    ['admin', '/admin/analytics'],
    ['admin', '/admin/journal-audit'],
    ['admin', '/admin/parametres'],
    ['admin', '/admin/taux-de-change'],
    ['admin', '/admin/integrations'],
    ['admin', '/admin/administrateurs'],
    ['admin', dispute && `/admin/litiges/${dispute.id}`],
    ['admin', payout && `/admin/retraits/${payout.id}`],
    ['admin', report && `/admin/signalements/${report.id}`],
    ['admin', application && `/admin/validation-formateurs/${application.id}`],
    ['admin', payoutMethod && `/admin/moyens-de-paiement/${payoutMethod.id}`],
  ]

  const cookies: Record<Persona, string | null> = {
    visiteur: null,
    apprenant: await sessionCookie(learner.id, { trainerId: null }),
    formateur: await sessionCookie(trainer.id, { trainerId: trainer.trainerProfile.id }),
    admin: await sessionCookie(admin.id, { trainerId: null }),
  }

  const planned = routes.filter((r): r is [Persona, string] => Boolean(r[1]))
  const skipped = routes.length - planned.length
  console.log(
    `\n${planned.length} routes · ${WARMUPS} tir(s) à blanc + ${SAMPLES} mesuré(s) · ${BASE}` +
      (skipped ? ` · ${skipped} route(s) sautée(s), échantillon absent en base` : ''),
  )

  const results: Measure[] = []
  for (const [persona, route] of planned) {
    const m = await measure(route, persona, cookies[persona])
    results.push(m)
    const warn = m.status >= 300 ? `  ⚠ HTTP ${m.status}` : ''
    console.log(`  ${String(m.median).padStart(5)} ms  ${persona.padEnd(10)} ${route}${warn}`)
  }

  // ---- Classement
  const ranked = [...results].sort((a, b) => b.median - a.median)
  console.log('\n── Les plus lentes ─────────────────────────────────────────')
  console.log('  médiane    p90    min   ko   route')
  for (const m of ranked.slice(0, 20)) {
    console.log(
      `  ${String(m.median).padStart(6)} ${String(m.p90).padStart(6)} ${String(m.min).padStart(6)} ` +
        `${String(Math.round(m.bytes / 1024)).padStart(4)}   ${m.route}`,
    )
  }

  const all = results.map((r) => r.median)
  console.log('\n── Vue d\'ensemble ──────────────────────────────────────────')
  console.log(`  médiane des médianes : ${Math.round(median(all))} ms`)
  console.log(`  la plus rapide       : ${Math.min(...all)} ms`)
  console.log(`  la plus lente        : ${Math.max(...all)} ms`)
  for (const seuil of [300, 500, 800, 1200]) {
    const n = results.filter((r) => r.median >= seuil).length
    console.log(`  ≥ ${String(seuil).padStart(4)} ms          : ${n} route(s)`)
  }

  const bad = results.filter((r) => r.status >= 300)
  if (bad.length) {
    console.log('\n⚠ Routes n\'ayant pas répondu 200 — mesure peu représentative :')
    for (const m of bad) console.log(`  HTTP ${m.status}  ${m.route}`)
  }

  if (JSON_OUT) {
    writeFileSync(JSON_OUT, JSON.stringify(results, null, 2), 'utf8')
    console.log(`\nDétail écrit dans ${JSON_OUT}`)
  }

  await db.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await db.$disconnect()
  process.exit(1)
})
