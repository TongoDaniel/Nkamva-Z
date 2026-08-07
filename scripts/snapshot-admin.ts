/**
 * Audit de l'accent du back-office — vérifie le **rendu**, pas le JSX.
 *
 * Une variable CSS est substituée au point de **déclaration**, pas au point de
 * lecture : `:root { --primary: var(--brand) }` vaut donc déjà le bleu produit
 * quand il descend dans `.nk-admin`, même si `.nk-admin` redéfinit `--brand` en
 * vert. Poser la classe ne suffit donc pas, et le résultat partiel est plus
 * difficile à repérer qu'une absence totale de bascule — d'où ce garde-fou.
 *
 * Le script ouvre les écrans admin avec une session admin forgée,
 * puis relève dans le DOM :
 *   - la présence de `.nk-admin` sur la coquille ;
 *   - les tokens d'accent **calculés** (bruts et dérivés) sous la coquille ;
 *   - les couleurs réellement peintes (pastille de marque, voile de fond,
 *     dégradés) ;
 *   - les tons des tuiles d'une rangée, et leur nombre de couleurs distinctes.
 * Il repasse ensuite sur des écrans hors admin pour vérifier que la classe ne
 * fuit pas et que le bleu produit y est intact.
 *
 *   bun scripts/snapshot-admin.ts
 *   bun scripts/snapshot-admin.ts --base http://localhost:3101
 *   bun scripts/snapshot-admin.ts --admin daniel.tongo@nkamva.com
 *   bun scripts/snapshot-admin.ts --shots .snapshots   # + captures PNG
 *
 * Aucune dépendance ajoutée : il pilote le Chrome installé via CDP. Surcharger
 * le binaire avec CHROME_PATH si besoin.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { encode } from 'next-auth/jwt'
import { db } from '../src/lib/db'

const SECRET = process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production'

/** Accent attendu de chaque bord. Source unique de ce que le script contrôle. */
const BLUE = '#1c5ed0'
const GREEN = '#0d6b4d'

/**
 * Les écrans du back-office. La plupart posent des tuiles de chiffres clés, et
 * leurs tons sont alors contrôlés ; ceux qui n'en posent pas restent surveillés
 * pour le reste — coquille, tokens, voile, dégradé. C'est le sens du scope
 * `.nk-admin` : il vaut pour tout le bord admin, pas pour ses tableaux de bord.
 */
const ADMIN_SCREENS = [
  '/admin',
  '/admin/analytics',
  '/admin/integrations',
  '/admin/abonnements',
  '/admin/journal-audit',
  '/admin/litiges',
  '/admin/moyens-de-paiement',
  '/admin/portefeuilles',
  '/admin/retraits',
  '/admin/signalements',
  '/admin/transactions',
  '/admin/utilisateurs',
  '/admin/validation-formateurs',
]

/** Témoins hors back-office : la classe ne doit pas y fuir. */
const CONTROL_SCREENS: { path: string; as: 'anon' | 'formateur' }[] = [
  { path: '/', as: 'anon' },
  { path: '/formateurs', as: 'anon' },
  { path: '/tarifs', as: 'anon' },
  { path: '/formateur', as: 'formateur' },
  { path: '/mes-ressources', as: 'formateur' },
  { path: '/mes-factures', as: 'formateur' },
]

/** Tokens bruts posés par `.nk-admin`. */
const CORE_TOKENS = ['--brand', '--brand-dark', '--brand-tint', '--brand-tint-2', '--brand-2', '--brand-shadow']

/**
 * Tokens qui *dérivent* de l'accent. Un `var()` étant substitué à sa
 * déclaration, ils restent en arrière si le scope ne les repose pas — c'est
 * exactement ce que ce tableau surveille.
 */
const DERIVED_TOKENS = [
  '--color-brand',
  '--color-brand-2',
  '--color-brand-dark',
  '--color-brand-tint',
  '--color-brand-tint-2',
  '--primary',
  '--accent',
  '--accent-foreground',
  '--ring',
  // Les deux premiers rangs de la palette catégorielle ensemble : `--chart-2`
  // n'hérite de rien, mais `:root` lui donne le vert forêt. Faire suivre
  // `--chart-1` l'accent les collait sur la même couleur dans l'admin — un
  // doublon qu'on ne voit qu'en les surveillant par paire.
  '--chart-1',
  '--chart-2',
  '--sidebar-primary',
  '--sidebar-ring',
]

/**
 * Valeur attendue de chaque token de chaque bord. Comparer à une valeur exacte
 * plutôt que « contient le bleu » : `--accent` vaut une *teinte*, il ne
 * contient ni #1c5ed0 ni #0d6b4d et passerait sous les radars.
 */
const EXPECTED: Record<'admin' | 'produit', Record<string, string>> = {
  admin: {
    '--brand': '#0d6b4d',
    '--brand-dark': '#0a563e',
    '--brand-tint': '#e0efe7',
    '--brand-tint-2': '#cfe6da',
    '--brand-2': '#12a06f',
    '--brand-shadow': '#0d6b4d4d',
    '--color-brand': '#0d6b4d',
    '--color-brand-2': '#12a06f',
    '--color-brand-dark': '#0a563e',
    '--color-brand-tint': '#e0efe7',
    '--color-brand-tint-2': '#cfe6da',
    '--primary': '#0d6b4d',
    '--accent': '#e0efe7',
    '--accent-foreground': '#0a563e',
    '--ring': '#0d6b4d',
    '--chart-1': '#0d6b4d',
    '--chart-2': '#2b5fa8',
    '--sidebar-primary': '#0d6b4d',
    '--sidebar-ring': '#0d6b4d',
  },
  produit: {
    '--brand': '#1c5ed0',
    '--brand-dark': '#144aa8',
    '--brand-tint': '#e4ecf9',
    '--brand-tint-2': '#d0dff5',
    '--brand-2': '#2e7cf6',
    '--brand-shadow': '#1c5ed04d',
    '--color-brand': '#1c5ed0',
    '--color-brand-2': '#2e7cf6',
    '--color-brand-dark': '#144aa8',
    '--color-brand-tint': '#e4ecf9',
    '--color-brand-tint-2': '#d0dff5',
    '--primary': '#1c5ed0',
    '--accent': '#e4ecf9',
    '--accent-foreground': '#144aa8',
    '--ring': '#1c5ed0',
    '--chart-1': '#1c5ed0',
    '--chart-2': '#0d6b4d',
    '--sidebar-primary': '#1c5ed0',
    '--sidebar-ring': '#1c5ed0',
  },
}

// ───────────────────────────── CDP minimal ─────────────────────────────

type CdpResponse = { id: number; result?: unknown; error?: { message: string } }

class Cdp {
  private ws: WebSocket
  private nextId = 1
  private pending = new Map<number, { ok: (v: any) => void; ko: (e: Error) => void }>()
  private events = new Map<string, ((params: any) => void)[]>()

  private constructor(ws: WebSocket) {
    this.ws = ws
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String((ev as MessageEvent).data)) as CdpResponse & {
        method?: string
        params?: unknown
      }
      if (msg.id !== undefined) {
        const slot = this.pending.get(msg.id)
        if (!slot) return
        this.pending.delete(msg.id)
        if (msg.error) slot.ko(new Error(msg.error.message))
        else slot.ok(msg.result)
        return
      }
      if (msg.method) for (const fn of this.events.get(msg.method) ?? []) fn(msg.params)
    })
  }

  static connect(url: string): Promise<Cdp> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      ws.addEventListener('open', () => resolve(new Cdp(ws)))
      ws.addEventListener('error', () => reject(new Error(`CDP injoignable : ${url}`)))
    })
  }

  send<T = any>(method: string, params: object = {}, sessionId?: string): Promise<T> {
    const id = this.nextId++
    const payload: Record<string, unknown> = { id, method, params }
    if (sessionId) payload.sessionId = sessionId
    this.ws.send(JSON.stringify(payload))
    return new Promise<T>((ok, ko) => this.pending.set(id, { ok, ko }))
  }

  once(method: string, timeoutMs = 30_000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`événement ${method} jamais reçu`)), timeoutMs)
      const list = this.events.get(method) ?? []
      const fn = (params: unknown) => {
        clearTimeout(timer)
        this.events.set(method, (this.events.get(method) ?? []).filter((f) => f !== fn))
        resolve(params)
      }
      this.events.set(method, [...list, fn])
    })
  }

  close() {
    this.ws.close()
  }
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean) as string[]
  const hit = candidates.find((p) => existsSync(p))
  if (!hit) throw new Error('Aucun Chrome trouvé — renseigner CHROME_PATH.')
  return hit
}

async function launchChrome() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'nk-snapshot-'))
  const child = spawn(
    findChrome(),
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      '--window-size=1440,1000',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  const portFile = join(userDataDir, 'DevToolsActivePort')
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (existsSync(portFile)) {
      const port = readFileSync(portFile, 'utf8').split('\n')[0]?.trim()
      if (port) {
        const { webSocketDebuggerUrl } = (await (
          await fetch(`http://127.0.0.1:${port}/json/version`)
        ).json()) as { webSocketDebuggerUrl: string }
        return {
          cdp: await Cdp.connect(webSocketDebuggerUrl),
          stop: () => {
            child.kill()
            try {
              rmSync(userDataDir, { recursive: true, force: true })
            } catch {
              /* Windows garde parfois un verrou sur le profil : sans effet. */
            }
          },
        }
      }
    }
    await new Promise((r) => setTimeout(r, 120))
  }
  child.kill()
  throw new Error("Chrome n'a pas ouvert son port de débogage.")
}

// ───────────────────────── session forgée ─────────────────────────

/**
 * Même forme de jeton que `scripts/smoke-session.ts` : `userId` (et non `sub`
 * seul) et `issuedAt` figé, sinon `isSessionRevoked` fait tomber la session.
 */
async function cookieFor(where: 'admin' | 'formateur', email?: string) {
  const user =
    where === 'formateur'
      ? await db.user.findFirst({
          where: { trainerProfile: { isNot: null } },
          select: { id: true, email: true, role: true, adminRole: true, sessionsValidAfter: true, trainerProfile: { select: { id: true } } },
          orderBy: { createdAt: 'asc' },
        })
      : await db.user.findFirst({
          where: email ? { email } : { role: 'ADMIN', adminRole: 'SUPER_ADMIN' },
          select: { id: true, email: true, role: true, adminRole: true, sessionsValidAfter: true, trainerProfile: { select: { id: true } } },
          orderBy: { createdAt: 'asc' },
        })

  if (!user) throw new Error(`Aucun utilisateur « ${email ?? where} » — lancer \`bun prisma/seed.ts\`.`)

  const value = await encode({
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
  return { value, email: user.email }
}

// ───────────────────────── relevé dans la page ─────────────────────────

/** Exécuté **dans** la page. Ne lit que des valeurs calculées. */
const PROBE = /* js */ `(() => {
  const shell = document.querySelector('.nk-admin');
  const deep = document.querySelector('#contenu') || shell || document.documentElement;
  const cs = getComputedStyle(deep);
  const root = getComputedStyle(document.documentElement);

  const vars = {};
  for (const n of ${JSON.stringify([...CORE_TOKENS, ...DERIVED_TOKENS])}) {
    vars[n] = cs.getPropertyValue(n).trim();
  }

  // Couleurs réellement peintes, pas des tokens.
  const paint = {};
  const markEl = document.querySelector('nav [class*="bg-brand"]');
  paint.pastilleMarque = markEl ? getComputedStyle(markEl).backgroundColor : null;
  const activeEl = document.querySelector('[aria-current="page"]');
  paint.lienActif = activeEl
    ? getComputedStyle(activeEl).backgroundColor + ' / ' + getComputedStyle(activeEl).color
    : null;
  const gradEl = document.querySelector('[class*="from-brand"]');
  paint.degradeAvatar = gradEl ? getComputedStyle(gradEl).backgroundImage : null;
  paint.voileFond = getComputedStyle(document.body, '::before').backgroundImage || null;

  // Rangée de tuiles : le ton est porté par la pastille d'icône.
  const grid = Array.from(document.querySelectorAll('#contenu div.grid')).find(
    (g) => g.children.length >= 3 && g.querySelector('.font-display'),
  );
  // Le ton se lit sur la pastille d'icône quand il y en a une, sinon sur le
  // filet vertical gauche. Relever la couleur *peinte* dans les deux cas.
  const tiles = grid ? Array.from(grid.children).map((tile) => {
    const chip = tile.querySelector('span[aria-hidden="true"]');
    const cs = getComputedStyle(tile);
    const rail = parseFloat(cs.borderLeftWidth) > 1 ? cs.borderLeftColor : null;
    const label = (tile.querySelector('small')?.textContent || '').trim().slice(0, 34);
    return {
      label,
      tone: chip ? getComputedStyle(chip).backgroundColor : rail,
      source: chip ? 'pastille' : rail ? 'filet' : 'aucun',
      detail: chip ? getComputedStyle(chip).color : cs.borderLeftWidth,
    };
  }) : [];

  return {
    url: location.pathname,
    shellPresent: !!shell,
    shellClass: shell ? shell.className.split(/\\s+/)[0] : null,
    rootBrand: root.getPropertyValue('--brand').trim(),
    vars,
    paint,
    tiles,
    tileCount: tiles.length,
    distinctTones: [...new Set(tiles.map((t) => t.tone).filter(Boolean))],
    heading: (document.querySelector('#contenu h1') || document.querySelector('h1'))?.textContent?.trim().slice(0, 40) || null,
  };
})()`

// ───────────────────────── pilotage ─────────────────────────

type Report = {
  url: string
  shellPresent: boolean
  rootBrand: string
  vars: Record<string, string>
  paint: Record<string, string | null>
  tiles: { label: string; tone: string | null; source: string; detail: string | null }[]
  tileCount: number
  distinctTones: string[]
  heading: string | null
}

/** #0d6b4d → rgb(13, 107, 77), pour comparer un token à une couleur peinte. */
function toRgb(hex: string) {
  const m = hex.replace('#', '').match(/.{2}/g)!.map((h) => parseInt(h, 16))
  return `rgb(${m[0]}, ${m[1]}, ${m[2]})`
}

/** Tokens qui s'écartent de l'accent attendu de leur bord. */
function strayTokens(vars: Record<string, string>, side: 'admin' | 'produit') {
  const want = EXPECTED[side]
  return Object.keys(want).filter((t) => (vars[t] ?? '').toLowerCase() !== want[t])
}

/** Voile de fond attendu : c'est un `body::before`, hors de portée du scope. */
function veilOk(veil: string | null, side: 'admin' | 'produit') {
  const tint = side === 'admin' ? 'rgba(13, 107, 77, 0.06)' : 'rgba(28, 94, 208, 0.06)'
  return !!veil && veil.includes(tint)
}

/** Les deux arrêts du dégradé de marque doivent rester du même bord. */
function gradientOk(grad: string | null, side: 'admin' | 'produit') {
  if (!grad) return true // pas d'avatar de marque sur cet écran
  const stops = side === 'admin' ? [toRgb(GREEN), toRgb('#12a06f')] : [toRgb(BLUE), toRgb('#2e7cf6')]
  return stops.every((s) => grad.includes(s))
}

async function main() {
  const args = process.argv.slice(2)
  const base = args[args.indexOf('--base') + 1]?.startsWith('http')
    ? args[args.indexOf('--base') + 1]
    : process.env.SNAPSHOT_BASE_URL || 'http://localhost:3000'
  const adminEmail = args.includes('--admin') ? args[args.indexOf('--admin') + 1] : undefined
  const shotsDir = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : undefined
  if (shotsDir) mkdirSync(shotsDir, { recursive: true })

  const admin = await cookieFor('admin', adminEmail)
  const trainer = await cookieFor('formateur')
  console.log(`Base      : ${base}`)
  console.log(`Admin     : ${admin.email}`)
  console.log(`Formateur : ${trainer.email}\n`)

  const { cdp, stop } = await launchChrome()
  const failures: string[] = []

  try {
    const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true })
    await cdp.send('Page.enable', {}, sessionId)
    await cdp.send('Network.enable', {}, sessionId)
    // En dev, Turbopack garde des noms de chunks stables : sans ça, Chrome
    // relit la feuille de styles de la passe précédente et le script rapporte
    // une anomalie déjà corrigée.
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId)

    const host = new URL(base).hostname
    const visit = async (path: string, cookie: string | null): Promise<Report> => {
      await cdp.send('Network.clearBrowserCookies', {}, sessionId)
      if (cookie) {
        await cdp.send(
          'Network.setCookie',
          { name: 'next-auth.session-token', value: cookie, domain: host, path: '/' },
          sessionId,
        )
      }
      const loaded = cdp.once('Page.loadEventFired')
      await cdp.send('Page.navigate', { url: `${base}${path}` }, sessionId)
      await loaded
      // Le rendu client (`AdminShell`) s'hydrate juste après `load`.
      await new Promise((r) => setTimeout(r, 350))
      const { result } = await cdp.send<{ result: { value: Report } }>(
        'Runtime.evaluate',
        { expression: PROBE, returnByValue: true, awaitPromise: true },
        sessionId,
      )
      if (shotsDir) {
        const { data } = await cdp.send<{ data: string }>('Page.captureScreenshot', { format: 'png' }, sessionId)
        const file = join(shotsDir, `${path.replace(/^\/|\/$/g, '').replace(/\//g, '_') || 'accueil'}.png`)
        writeFileSync(file, Buffer.from(data, 'base64'))
      }
      return result.value
    }

    // ── 1. Écrans admin ────────────────────────────────────────────────
    console.log(`━━━ ${ADMIN_SCREENS.length} écrans admin ━━━\n`)
    const adminReports: Report[] = []
    for (const path of ADMIN_SCREENS) {
      const r = await visit(path, admin.value)
      adminReports.push(r)

      const shellOk = r.shellPresent
      const stray = strayTokens(r.vars, 'admin')
      const veil = veilOk(r.paint.voileFond, 'admin')
      const grad = gradientOk(r.paint.degradeAvatar, 'admin')
      // Un écran sans tuile n'a pas de tons à contrôler. Exiger quatre couleurs
      // là où il n'y a aucune tuile ferait échouer l'audit sur un écran sain.
      const tonesOk = r.tileCount === 0 || (r.tileCount >= 4 && r.distinctTones.length >= 4)

      const flag = shellOk && !stray.length && veil && grad && tonesOk ? '✅' : '❌'
      console.log(
        `${flag} ${path.padEnd(32)} shell=${shellOk ? 'oui' : 'NON'}  --brand=${r.vars['--brand'] || '?'}  ` +
          `voile=${veil ? 'vert' : 'BLEU'}  dégradé=${grad ? 'vert' : 'BICOLORE'}  ` +
          `tuiles=${r.tileCount} tons distincts=${r.distinctTones.length}` +
          (stray.length ? `  hors accent: ${stray.join(', ')}` : ''),
      )

      if (!shellOk) failures.push(`${path} : \`.nk-admin\` absente du DOM rendu`)
      if (stray.length) {
        failures.push(
          `${path} : tokens hors accent admin — ${stray.map((t) => `${t}=${r.vars[t] || '?'}`).join(', ')}`,
        )
      }
      if (!veil) failures.push(`${path} : voile de fond resté bleu (${r.paint.voileFond ?? '—'})`)
      if (!grad) failures.push(`${path} : dégradé de marque bicolore (${r.paint.degradeAvatar ?? '—'})`)
      if (!tonesOk) {
        failures.push(
          `${path} : ${r.distinctTones.length} couleur(s) distincte(s) sur ${r.tileCount} tuiles (4 attendues)`,
        )
      }
    }

    // ── 2. Balayage getComputedStyle détaillé, sur un écran ────────────
    const sample = adminReports.find((r) => r.url === '/admin/retraits') ?? adminReports[0]
    console.log(`\n━━━ Balayage getComputedStyle — ${sample.url} ━━━\n`)
    console.log(`  .nk-admin dans le DOM : ${sample.shellPresent ? 'oui' : 'NON'}`)
    console.log(`  :root --brand         : ${sample.rootBrand}  (doit rester ${BLUE})`)
    const line = (t: string) => {
      const got = (sample.vars[t] || '—').toLowerCase()
      const want = EXPECTED.admin[t]
      const verdict = got === want ? '✅' : `❌ attendu ${want}`
      console.log(`    ${t.padEnd(24)} ${got.padEnd(12)} ${verdict}`)
    }
    console.log('\n  Tokens bruts posés par le scope')
    CORE_TOKENS.forEach(line)
    console.log('\n  Tokens dérivés (substitués à leur déclaration)')
    DERIVED_TOKENS.forEach(line)
    console.log('\n  Couleurs réellement peintes')
    for (const [k, v] of Object.entries(sample.paint)) {
      console.log(`    ${k.padEnd(24)} ${v ?? '—'}`)
    }
    // Rangée de tuiles : montrer l'écran le mieux loti, sinon un « 0 ton
    // partout » laisse croire à une régression de l'accent alors que c'est
    // `StatTile` qui n'émet pas de pastille sans icône.
    const best = [...adminReports].sort((a, b) => b.distinctTones.length - a.distinctTones.length)[0]
    for (const r of best === sample ? [sample] : [sample, best]) {
      console.log(`\n  Rangée de tuiles — ${r.url}`)
      if (!r.tiles.length) console.log('    (aucune tuile trouvée)')
      for (const t of r.tiles) {
        console.log(
          `    ${(t.label || '(sans libellé)').padEnd(34)} ton = ${(t.tone ?? 'AUCUN').padEnd(22)} via ${t.source}`,
        )
      }
      console.log(`    → ${r.distinctTones.length} couleur(s) distincte(s) sur ${r.tileCount} tuiles`)
    }

    // ── 3. Témoins hors admin ──────────────────────────────────────────
    console.log('\n━━━ Écrans hors back-office (la classe ne doit pas fuir) ━━━\n')
    for (const { path, as } of CONTROL_SCREENS) {
      const r = await visit(path, as === 'formateur' ? trainer.value : null)
      const leaked = r.shellPresent
      const stray = strayTokens(r.vars, 'produit')
      const veil = veilOk(r.paint.voileFond, 'produit')
      const grad = gradientOk(r.paint.degradeAvatar, 'produit')
      const flag = !leaked && !stray.length && veil && grad ? '✅' : '❌'
      console.log(
        `${flag} ${path.padEnd(24)} (${as.padEnd(9)}) .nk-admin=${leaked ? 'FUITE' : 'absente'}  ` +
          `--brand=${r.vars['--brand'] || '?'}  voile=${veil ? 'bleu' : 'HORS ACCENT'}  ` +
          `dégradé=${grad ? 'bleu' : 'HORS ACCENT'}  titre=${r.heading ?? '—'}` +
          (stray.length ? `  hors accent: ${stray.join(', ')}` : ''),
      )
      if (leaked) failures.push(`${path} : \`.nk-admin\` a fui hors du back-office`)
      if (stray.length) {
        failures.push(
          `${path} : tokens hors accent produit — ${stray.map((t) => `${t}=${r.vars[t] || '?'}`).join(', ')}`,
        )
      }
      if (!veil) failures.push(`${path} : voile de fond hors accent produit (${r.paint.voileFond ?? '—'})`)
      if (!grad) failures.push(`${path} : dégradé de marque hors accent produit (${r.paint.degradeAvatar ?? '—'})`)
    }
  } finally {
    cdp.close()
    stop()
  }

  console.log('')
  if (failures.length) {
    console.log(`❌ ${failures.length} anomalie(s) :`)
    for (const f of failures) console.log(`   · ${f}`)
    process.exit(1)
  }
  console.log('✅ Accent admin vert, accent produit bleu, aucune fuite.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
