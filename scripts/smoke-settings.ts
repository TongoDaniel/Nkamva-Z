/**
 * Vérification des réglages système : prouve que les modifier change ce que
 * fait la plateforme, et pas seulement ce qui est stocké.
 *
 *   bun run dev                      # dans un autre terminal
 *   bun scripts/smoke-settings.ts
 *
 * Chaque réglage est modifié pour de vrai — par `updateSetting`, la même
 * fonction que la route de l'écran Paramètres, journalisation comprise — puis
 * les écrans qui le consomment sont relus et doivent afficher la nouvelle
 * valeur *et* avoir perdu l'ancienne. Un écran qui affiche encore l'ancienne
 * est un écran qui n'a pas été câblé, quoi qu'en dise la base.
 *
 * Les valeurs d'origine sont restaurées à la fin, y compris si un contrôle
 * échoue : ce script tourne sur la base de développement.
 */
import { encode } from 'next-auth/jwt'
import { db } from '../src/lib/db'
import { searchCourses } from '../src/lib/catalog'
import { updateSetting, getSettingNumber, SETTING_SPECS } from '../src/lib/settings'

const BASE = 'http://localhost:3000'
const SECRET = process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production'
const mail = (key: string) => `tongodanielfo+${key}@gmail.com`

async function cookieFor(email: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({
    where: { email },
    select: { id: true, email: true, role: true, adminRole: true, sessionsValidAfter: true, trainerProfile: { select: { id: true } } },
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

async function html(path: string, cookie?: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
  })
  const body = await res.text()
  // Un 200 ne prouve rien : `error.tsx` absorbe les plantages de rendu.
  if (body.includes('Une erreur est survenue')) {
    throw new Error(`${path} a rendu la page d'erreur`)
  }
  return body
}

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`✓ ${label}`)
  else {
    failures++
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/**
 * Fiches de ressources distinctes liées depuis une page.
 *
 * L'attribut `href="…"` est obligatoire dans le motif : le HTML porte aussi la
 * charge RSC, où les mêmes URL apparaissent échappées et tronquées. Un motif
 * plus lâche y attrape des fantômes et fait compter six cartes là où la page
 * en montre cinq — le contrôle accuse alors le code d'un défaut qui est le sien.
 */
function courseSlugs(page: string): Set<string> {
  return new Set(Array.from(page.matchAll(/href="\/ressources\/([a-z0-9-]+)"/g), (m) => m[1]))
}

/**
 * React sépare `Sous {n} heures` en nœuds de texte distincts, marqués par un
 * commentaire vide : le HTML servi porte « Sous 36<!-- --> heures ouvrées ».
 * Sans ce nettoyage, aucune phrase interpolée ne se retrouve dans la page.
 */
function readable(page: string): string {
  return page.replaceAll('<!-- -->', '')
}

/** « > 48 h » traverse le HTML échappé ou non selon le contexte de rendu. */
function mentionsHours(page: string, hours: number): boolean {
  const text = readable(page)
  return text.includes(`&gt; ${hours} h`) || text.includes(`> ${hours} h`)
}

async function main() {
  const admin = await db.user.findUniqueOrThrow({ where: { email: mail('admin') }, select: { id: true } })
  const finances = await cookieFor(mail('finances'))

  const original = new Map<string, string>()
  for (const key of Object.keys(SETTING_SPECS)) {
    const row = await db.setting.findUnique({ where: { key }, select: { value: true } })
    if (!row) throw new Error(`Réglage absent en base : ${key}. Lancer le seed d'abord.`)
    original.set(key, row.value)
  }

  try {
    // ---- catalog.featured_limit ----------------------------------------
    // Les fiches attendues viennent de `searchCourses`, la requête même de la
    // vitrine : compter des cartes ne dirait pas si ce sont les bonnes.
    for (const limit of [1, 3, 7]) {
      await updateSetting('catalog.featured_limit', String(limit), admin.id)
      const shown = courseSlugs(await html('/'))
      const expected = (await searchCourses({ sort: 'newest', page: 1, pageSize: limit })).items
      check(
        `page d'accueil : ${expected.length} ressource(s) mise(s) en avant pour catalog.featured_limit = ${limit}`,
        shown.size === expected.length && expected.every((c) => shown.has(c.slug)),
        `fiches sur la page : ${[...shown].join(', ') || '(aucune)'}`,
      )
    }

    // ---- support.response_time_hours ------------------------------------
    const before = original.get('support.response_time_hours')!
    await updateSetting('support.response_time_hours', '36', admin.id)
    for (const path of ['/contact', '/aide', '/legal/mentions']) {
      const page = readable(await html(path))
      check(
        `${path} annonce 36 heures ouvrées`,
        page.includes('36 heures ouvrées') && !page.includes(`${before} heures ouvrées`),
        `ancienne valeur (${before} h) encore présente ou nouvelle absente`,
      )
    }

    // ---- payouts.review_sla_hours ---------------------------------------
    await updateSetting('payouts.review_sla_hours', '12', admin.id)
    check(
      'lib : getSettingNumber rend bien 12',
      (await getSettingNumber('payouts.review_sla_hours')) === 12,
    )
    for (const path of ['/admin/retraits', '/admin/moyens-de-paiement']) {
      const page = await html(path, finances)
      check(
        `${path} compte « hors délai (> 12 h) »`,
        mentionsHours(page, 12) && !mentionsHours(page, 48),
        'la tuile affiche encore 48 h',
      )
    }
    // Le même délai est *promis* au formateur : Fatou a un moyen de paiement
    // en attente d'instruction, son portefeuille annonce donc le SLA.
    const wallet = readable(await html('/formateur/portefeuille', await cookieFor(mail('fatou'))))
    check(
      '/formateur/portefeuille promet une revue sous 12 h ouvrées',
      wallet.includes('sous 12 h ouvrées') && !wallet.includes('sous 48 h'),
      'le portefeuille annonce encore 48 h',
    )

    // ---- l'écran Paramètres dit ce que chaque clé commande ---------------
    const params = readable(await html('/admin/parametres', await cookieFor(mail('admin'))))
    check(
      "/admin/parametres n'affirme plus qu'aucun écran ne relit les réglages",
      !params.includes('Aucun écran ne les relit'),
    )
    for (const [key, spec] of Object.entries(SETTING_SPECS)) {
      check(
        `/admin/parametres annonce l'effet et les bornes de ${key}`,
        params.includes(spec.effect.slice(0, 40)) &&
          params.includes(`Entier de ${spec.min} à ${spec.max}`),
      )
    }
    check(
      "/admin/parametres ne présente plus le SLA comme une règle du code",
      !params.includes('SLA de revue manuelle'),
    )

    // ---- refus des valeurs hors bornes ----------------------------------
    const spec = SETTING_SPECS['catalog.featured_limit']
    for (const bad of [String(spec.max + 1), '0', '-3', 'huit', '8.5']) {
      let rejected = false
      try {
        await updateSetting('catalog.featured_limit', bad, admin.id)
      } catch (err) {
        rejected = err instanceof Error && err.message === 'SETTING_VALUE_INVALID'
      }
      check(`catalog.featured_limit refuse « ${bad} »`, rejected)
    }

    // Le refus doit aussi traverser la route : un garde qui ne remonte pas au
    // client laisse l'écran croire que l'enregistrement a réussi.
    const res = await fetch(`${BASE}/api/admin/settings/catalog.featured_limit`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: await cookieFor(mail('admin')) },
      body: JSON.stringify({ value: '999' }),
    })
    const payload = (await res.json()) as { error?: { code?: string } }
    check(
      'PATCH /api/admin/settings — 422 SETTING_VALUE_INVALID sur une valeur hors bornes',
      res.status === 422 && payload.error?.code === 'SETTING_VALUE_INVALID',
      `reçu ${res.status} ${JSON.stringify(payload)}`,
    )
  } finally {
    for (const [key, value] of original) {
      const current = await db.setting.findUnique({ where: { key }, select: { value: true } })
      if (current && current.value !== value) await updateSetting(key, value, admin.id)
    }
    console.log('\nValeurs d’origine restaurées.')
  }

  console.log(failures ? `\n${failures} contrôle(s) en échec.` : '\nTous les réglages sont câblés.')
  if (failures) process.exitCode = 1
}

main().finally(() => db.$disconnect())
