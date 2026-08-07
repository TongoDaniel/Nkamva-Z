/**
 * Vérification de l'écran d'état des intégrations.
 *
 *   bun run dev                          # dans un autre terminal
 *   bun scripts/smoke-integrations.ts
 *
 * Deux bords, parce que deux choses différentes peuvent être fausses :
 *
 *   1. **Les sondes** — appelées ici directement, contre le `.env` réel. Elles
 *      lisent un solde, une configuration, une liste ; aucune n'écrit ni ne
 *      facture. C'est le seul moyen de savoir si un `absent` de l'écran dit
 *      « pas de clé » ou « clé refusée ».
 *   2. **L'écran** — relu en HTTP avec un cookie Super-admin. Un 200 ne prouve
 *      rien (`error.tsx` absorbe les plantages de rendu), et une page qui rend
 *      sans afficher l'état d'un fournisseur serait pire qu'absente : elle
 *      laisserait croire que ce fournisseur va bien.
 *
 * Le contrôle qui compte le plus est le dernier : **aucune valeur de secret ne
 * doit se retrouver dans le HTML servi.** L'écran nomme des variables ; il ne
 * doit jamais en rendre le contenu, ni directement, ni recopié par le message
 * d'erreur d'un SDK.
 */
import { encode } from 'next-auth/jwt'
import { db } from '../src/lib/db'
import { probeIntegrations, countByState } from '../src/lib/integrations'

const BASE = 'http://localhost:3000'
const SECRET = process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production'
const mail = (key: string) => `tongodanielfo+${key}@gmail.com`

/** Variables dont la valeur ne doit jamais traverser l'écran. */
const SECRET_ENV = [
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'RESEND_API_KEY', 'PAWAPAY_API_TOKEN',
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET',
  'MUX_TOKEN_ID', 'MUX_TOKEN_SECRET', 'MUX_WEBHOOK_SECRET', 'NEXTAUTH_SECRET',
]

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

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`✓ ${label}`)
  else {
    failures++
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/**
 * Rend le HTML comparable aux chaînes du code. Deux transformations, et les
 * oublier fabrique de faux échecs :
 *
 *   · React coupe les phrases interpolées par un commentaire vide ;
 *   · il échappe les cinq caractères du HTML — l'apostrophe comprise, et nos
 *     libellés en sont pleins (« l'achat », « n'est pas »).
 */
function readable(page: string): string {
  return page
    .replaceAll('<!-- -->', '')
    .replaceAll('&#x27;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&')
}

async function main() {
  // ---- 1. Les sondes, contre le .env réel --------------------------------
  console.log('— Sondes ————————————————————————————————————————')
  const report = await probeIntegrations()
  for (const integration of report.integrations) {
    console.log(`\n${integration.name.padEnd(22)} ${integration.state.toUpperCase()}  (${integration.elapsedMs} ms)`)
    for (const c of integration.checks) {
      console.log(`  ${c.state === 'ok' ? '✓' : c.state === 'warn' ? '~' : '✗'} ${c.label.padEnd(26)} ${c.detail}`)
    }
  }
  const counts = countByState(report.integrations)
  console.log(
    `\n${counts.ok}/${report.integrations.length} au vert — ${counts.warn} avec réserve, ` +
    `${counts.absent} non configuré(s), ${counts.down} en échec.`,
  )
  console.log(`Simulation de paiement : ${report.paymentSimulation.active ? 'ACTIVE' : 'fermée'}\n`)

  check('les six fournisseurs sont sondés', report.integrations.length === 6)
  check(
    'chaque sonde répond sous le délai maximum',
    report.integrations.every((i) => i.elapsedMs < 9_000),
    report.integrations.map((i) => `${i.name}: ${i.elapsedMs} ms`).join(', '),
  )

  // ---- 2. L'écran -------------------------------------------------------
  console.log('— Écran —————————————————————————————————————————')
  const superAdmin = await cookieFor(mail('admin'))
  const res = await fetch(`${BASE}/admin/integrations`, {
    headers: { cookie: superAdmin },
    redirect: 'manual',
  })
  const raw = await res.text()
  const page = readable(raw)

  check('/admin/integrations répond 200 au Super-admin', res.status === 200, `reçu ${res.status}`)
  // Un 200 ne prouve rien : la frontière d'erreur rend elle aussi un 200.
  check("la page n'est pas la frontière d'erreur", !page.includes('Une erreur est survenue'))

  for (const integration of report.integrations) {
    check(`la page nomme ${integration.name}`, page.includes(integration.name))
    check(
      `la page rend l'état de ${integration.name} et ce que son absence provoque`,
      integration.checks.every((c) => page.includes(c.detail.slice(0, 45))) &&
        page.includes(integration.whenAbsent.slice(0, 45)),
    )
  }
  check(
    'la page annonce le décompte au vert',
    page.includes(`${counts.ok}/${report.integrations.length}`),
  )

  // ---- 3. Le contrôle qui compte : aucun secret dans le HTML -------------
  for (const name of SECRET_ENV) {
    const value = process.env[name]
    if (!value || value.length < 8) continue
    // On ne rend jamais la valeur cherchée, même en cas d'échec : le message ne
    // dit que le nom de la variable en cause.
    // Les deux formes : brute, et déséchappée — un secret qui contiendrait `&`
    // ou `'` passerait sinon à travers l'un des deux tamis.
    check(
      `la valeur de ${name} n'apparaît pas dans le HTML`,
      !raw.includes(value) && !page.includes(value),
    )
  }

  // ---- 4. La porte ------------------------------------------------------
  const finances = await fetch(`${BASE}/admin/integrations`, {
    headers: { cookie: await cookieFor(mail('finances')) },
    redirect: 'manual',
  })
  check(
    "un admin Finances est renvoyé vers /admin (l'écran nomme la configuration du déploiement)",
    finances.status === 307 || finances.status === 302,
    `reçu ${finances.status}`,
  )
  const anonymous = await fetch(`${BASE}/admin/integrations`, { redirect: 'manual' })
  check(
    'un visiteur non connecté est renvoyé vers la connexion',
    anonymous.status === 307 || anonymous.status === 302,
    `reçu ${anonymous.status}`,
  )

  console.log(failures ? `\n${failures} contrôle(s) en échec.` : '\nTous les contrôles passent.')
  if (failures) process.exitCode = 1
}

main().finally(() => db.$disconnect())
