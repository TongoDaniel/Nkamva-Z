/**
 * Vérification du journal d'audit.
 *
 *   bun run dev                          # dans un autre terminal
 *   bun scripts/smoke-journal-audit.ts
 *
 * Trois propriétés, dans l'ordre où elles ont manqué :
 *
 * 1. **Toute action présente en base porte un libellé.** Le repli `humanize`
 *    empêche l'écran de casser, mais rend de l'anglais mécanique : le contrôle
 *    doit voir les manques, pas s'en satisfaire.
 * 2. **Aucune action n'échappe aux onglets.** Un filtre qui ne sait pas
 *    atteindre une famille la rend introuvable dès que le journal dépasse
 *    quelques pages.
 * 3. **L'écran affiche vraiment l'heure et les identifiants entiers.** Le reste
 *    ne se prouve que sur le HTML servi.
 */
import { encode } from 'next-auth/jwt'
import { db } from '../src/lib/db'
import {
  AUDIT_ACTION_LABELS, AUDIT_TARGET_LABELS, AUDIT_ACTION_GROUPS,
} from '../src/lib/audit-labels'

const BASE = 'http://localhost:3000'
const SECRET = process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production'

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`✓ ${label}`)
  else {
    failures++
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/** React coupe les textes interpolés par un commentaire vide. */
const readable = (page: string) => page.replaceAll('<!-- -->', '')

async function main() {
  // --- 1. Couverture des libellés ---------------------------------------
  const actions = (await db.auditLog.groupBy({ by: ['action'], _count: { _all: true } }))
    .sort((a, b) => b._count._all - a._count._all)
  const missing = actions.filter((a) => !AUDIT_ACTION_LABELS[a.action])
  check(
    `${actions.length} actions en base, toutes traduites`,
    missing.length === 0,
    `sans libellé : ${missing.map((m) => `${m.action} (${m._count._all})`).join(', ')}`,
  )

  const targets = await db.auditLog.groupBy({ by: ['targetType'], _count: { _all: true } })
  const missingTargets = targets
    .map((t) => t.targetType)
    .filter((t): t is string => Boolean(t) && !AUDIT_TARGET_LABELS[t as string])
  check(
    `${targets.length} types d'objet, tous traduits`,
    missingTargets.length === 0,
    `sans libellé : ${missingTargets.join(', ')}`,
  )

  // --- 2. Aucune action hors filtre --------------------------------------
  const groups = AUDIT_ACTION_GROUPS.filter((g) => g.prefixes.length > 0)
  const unfiltered = actions
    .map((a) => a.action)
    .filter((action) => !groups.some((g) => g.prefixes.some((p) => action.startsWith(p))))
  check(
    'chaque action est atteignable par un onglet',
    unfiltered.length === 0,
    `hors filtre : ${unfiltered.join(', ')}`,
  )

  // --- 3. Ce que l'écran affiche réellement ------------------------------
  const admin = await db.user.findFirstOrThrow({
    where: { adminRole: 'SUPER_ADMIN' },
    select: { id: true, email: true, role: true, adminRole: true, sessionsValidAfter: true },
  })
  const token = await encode({
    token: {
      userId: admin.id, role: admin.role, adminRole: admin.adminRole, trainerId: null,
      sessionsValidAfter: admin.sessionsValidAfter.toISOString(),
      issuedAt: Math.floor(Date.now() / 1000), sub: admin.id, email: admin.email,
    },
    secret: SECRET,
  })
  const cookie = `next-auth.session-token=${token}`

  const fetchTab = async (group: string) =>
    readable(
      await (
        await fetch(`${BASE}/admin/journal-audit?groupe=${group}`, { headers: { cookie } })
      ).text(),
    )

  // Deux onglets, parce que les réglages et les tâches planifiées ne vivent
  // plus dans la même famille : « Plateforme » porte ce que l'administration
  // décide, « Tâches & intégrations » ce que la machine exécute.
  const platform = await fetchTab('platform')
  const jobs = await fetchTab('jobs')

  check(
    'le journal rend sans page d’erreur',
    !platform.includes('Une erreur est survenue') && !jobs.includes('Une erreur est survenue'),
  )

  // L'heure : `fmtDateTime` produit « 7 août 2026, 14:32:07 ». On cherche le
  // motif horaire, pas une valeur figée.
  check('les entrées portent une heure à la seconde', /\d{2}:\d{2}:\d{2}/.test(platform))

  check(
    'le libellé français remplace le code en tête de ligne',
    platform.includes('Réglage modifié') && jobs.includes('Tâche planifiée terminée'),
  )

  check(
    'le code brut reste affiché, pour retrouver la ligne dans le source',
    platform.includes('SETTING_UPDATED'),
  )

  // Le défaut d'origine : `support.response_time_hours` coupé à « support. ».
  const settingKeys = ['support.response_time_hours', 'payouts.review_sla_hours', 'catalog.featured_limit']
  const shown = settingKeys.filter((k) => platform.includes(k))
  check(
    'les clés de réglage s’affichent entières',
    shown.length > 0,
    `aucune des clés ${settingKeys.join(', ')} n'apparaît en entier`,
  )

  check(
    'le type d’objet est traduit',
    platform.includes('Réglage') && jobs.includes('Tâche planifiée'),
  )

  // Un identifiant opaque, lui, reste abrégé.
  // La plus récente, donc en première page : le journal rend 30 entrées par
  // page et la trouver ailleurs ne prouverait rien.
  const withCuid = await db.auditLog.findFirst({
    where: { targetType: 'Purchase' },
    orderBy: { createdAt: 'desc' },
    select: { targetId: true },
  })
  if (withCuid?.targetId) {
    const purchases = readable(
      await (
        await fetch(`${BASE}/admin/journal-audit?groupe=purchases`, { headers: { cookie } })
      ).text(),
    )
    // C'est le **texte affiché** qui doit être abrégé, pas le HTML : le `href`
    // du filtre et l'infobulle portent volontairement l'identifiant entier.
    const short = withCuid.targetId.slice(0, 8)
    check(
      'un identifiant opaque reste abrégé à huit caractères à l’écran',
      purchases.includes(`>${short}</a>`),
      `cible ${withCuid.targetId}, forme abrégée « ${short} » absente du texte rendu`,
    )
  }

  // --- 4. Les onglets rendent bien quelque chose -------------------------
  for (const group of groups) {
    const html = readable(
      await (
        await fetch(`${BASE}/admin/journal-audit?groupe=${group.value}`, { headers: { cookie } })
      ).text(),
    )
    const empty = html.includes('Aucune entrée')
    const expected = actions
      .filter((a) => group.prefixes.some((p) => a.action.startsWith(p)))
      .reduce((sum, a) => sum + a._count._all, 0)
    check(
      `onglet « ${group.label} » : ${expected} entrée(s) attendue(s)`,
      expected > 0 ? !empty : empty,
      empty ? 'écran vide alors que la base en contient' : 'écran peuplé alors que la base est vide',
    )
  }

  console.log(failures ? `\n${failures} contrôle(s) en échec.` : '\nJournal conforme.')
  if (failures) process.exitCode = 1
}

main().finally(() => db.$disconnect())
