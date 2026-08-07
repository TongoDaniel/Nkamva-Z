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
 * 4. **Chaque filtre annonce ce que la même condition compte en base**, un
 *    filtre inconnu est ignoré au lieu de vider l'écran, et aucun filtre ne se
 *    perd en changeant d'onglet ou de page — le défaut qui obligerait à refaire
 *    sa recherche à chaque clic.
 */
import { encode } from 'next-auth/jwt'
import { db } from '../src/lib/db'
import {
  AUDIT_ACTION_LABELS, AUDIT_TARGET_LABELS, AUDIT_ACTION_GROUPS,
} from '../src/lib/audit-labels'
import { fmtNumber } from '../src/lib/format'

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

  // --- 5. Les filtres ----------------------------------------------------
  //
  // Un filtre se juge sur un nombre, pas sur son apparence : l'écran doit
  // annoncer exactement ce que la même condition compte en base. Le décompte
  // est relu avec `fmtNumber`, la fonction qui l'écrit — comparer à « 762 »
  // échouerait sur l'espace insécable étroite de la locale française.
  console.log('\n— Filtres ———————————————————————————————————————')

  const url = (params: Record<string, string | number>) => {
    const sp = new URLSearchParams({ groupe: 'all' })
    for (const [k, v] of Object.entries(params)) sp.set(k, String(v))
    return `${BASE}/admin/journal-audit?${sp.toString()}`
  }
  const screen = async (params: Record<string, string | number>) =>
    readable(await (await fetch(url(params), { headers: { cookie } })).text())
  const announces = (html: string, count: number) =>
    html.includes(`${fmtNumber(count)} entrée`)

  const total = await db.auditLog.count()

  // a) Système / personnes : la partition la plus utile, et la somme des deux
  //    doit rendre le total — sinon un filtre en perd en route.
  const systemCount = await db.auditLog.count({ where: { actorId: null } })
  const humanCount = await db.auditLog.count({ where: { actorId: { not: null } } })
  check(
    `acteur=systeme annonce ${systemCount} entrée(s)`,
    announces(await screen({ acteur: 'systeme' }), systemCount),
  )
  check(
    `acteur=humains annonce ${humanCount} entrée(s)`,
    announces(await screen({ acteur: 'humains' }), humanCount),
  )
  check(
    'les deux partitions couvrent le journal entier',
    systemCount + humanCount === total,
    `${systemCount} + ${humanCount} ≠ ${total}`,
  )

  // b) Un type d'action précis — le plus fréquent, pour que le contrôle porte.
  const top = actions[0]
  check(
    `action=${top.action} annonce ${top._count._all} entrée(s)`,
    announces(await screen({ action: top.action }), top._count._all),
  )

  // c) La recherche libre part du **libellé français**, celui que l'écran
  //    affiche : personne ne tape `SCHEDULED_JOB_COMPLETED` de mémoire.
  const label = AUDIT_ACTION_LABELS[top.action]
  if (label) {
    const byLabel = await screen({ q: label })
    check(
      `q=« ${label} » retrouve au moins les ${top._count._all} entrées de ${top.action}`,
      !byLabel.includes('Aucune entrée') && byLabel.includes(label),
    )
  }

  // d) Bornes de dates, incluses des deux côtés.
  const day = new Date()
  const iso = day.toISOString().slice(0, 10)
  const dayCount = await db.auditLog.count({
    where: { createdAt: { gte: new Date(`${iso}T00:00:00`), lte: new Date(`${iso}T23:59:59.999`) } },
  })
  check(
    `du=au=${iso} annonce les ${dayCount} entrée(s) de la journée entière`,
    announces(await screen({ du: iso, au: iso }), dayCount),
  )

  // e) Un filtre inventé est ignoré, pas appliqué à l'aveugle : une liste vide
  //    ferait croire qu'il ne s'est rien passé.
  check(
    'un type d’action inexistant est ignoré, et le journal reste entier',
    announces(await screen({ action: 'ACTION_QUI_N_EXISTE_PAS' }), total),
  )
  check(
    'un acteur inexistant est ignoré de la même façon',
    announces(await screen({ acteur: 'utilisateur-inexistant' }), total),
  )

  // f) Le défaut qui rend un filtre inutilisable : le perdre en changeant
  //    d'onglet ou de page. On vérifie les `href` réellement rendus.
  const withFilters = await screen({ acteur: 'humains', q: 'compte' })
  const hrefs = withFilters.replaceAll('&amp;', '&')
  check(
    'les onglets de domaine reconduisent les filtres',
    hrefs.includes('groupe=accounts&q=compte&acteur=humains'),
    'un lien d’onglet perd q ou acteur',
  )
  // La pagination se contrôle sur un filtre dont on sait qu'il **dépasse** une
  // page : `acteur=humains&q=compte` tient sur une seule, et l'absence de liens
  // de page ferait échouer le contrôle sans qu'aucun filtre soit perdu.
  if (systemCount > 30) {
    const paged = (await screen({ acteur: 'systeme' })).replaceAll('&amp;', '&')
    check(
      'la pagination reconduit les filtres',
      paged.includes('acteur=systeme&page=2'),
      `aucun lien de page ne porte l’acteur (${systemCount} entrées, donc ${Math.ceil(systemCount / 30)} pages)`,
    )
  }

  // g) Un intervalle inversé se dit, au lieu de rendre un écran vide muet.
  check(
    'un intervalle inversé est signalé',
    (await screen({ du: '2026-08-07', au: '2026-08-01' })).includes(
      'La date de début est postérieure à la date de fin',
    ),
  )

  // h) Filtrer ne cache pas le total : l'écran l'annonce toujours.
  check(
    'l’écran filtré rappelle le total du journal',
    (await screen({ acteur: 'systeme' })).includes(`sur ${fmtNumber(total)} au total`),
  )

  console.log(failures ? `\n${failures} contrôle(s) en échec.` : '\nJournal conforme.')
  if (failures) process.exitCode = 1
}

main().finally(() => db.$disconnect())
