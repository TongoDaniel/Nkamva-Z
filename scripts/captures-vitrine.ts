/**
 * Recapture les trois écrans montrés dans la section « Le produit » de la page
 * d'accueil publique (`src/app/(public)/page.tsx`, tableau `PRODUCT_ROWS`).
 *
 * La vitrine promet « des écrans réels de la plateforme ». Ces images sont des
 * fichiers statiques : elles ne suivent pas le produit, et se démentent en
 * silence. Le premier jeu, capturé le 1er août 2026, montrait encore un fil
 * d'Ariane « Tableau de bord › Catalogue » et un bouton « Ajouter au panier »
 * qui n'existent plus. D'où ce script : rejouer la capture, plutôt que de
 * retoucher une image à la main.
 *
 *   bun scripts/captures-vitrine.ts
 *   bun scripts/captures-vitrine.ts --out .captures     # relire avant d'écraser
 *   bun scripts/captures-vitrine.ts --base http://localhost:3101
 *
 * Aucune dépendance ajoutée : il pilote le Chrome installé via CDP, comme
 * `scripts/snapshot-admin.ts`. Surcharger le binaire avec CHROME_PATH si besoin.
 *
 * Trois précautions, sans lesquelles la capture ment :
 *  - `prefers-reduced-motion` est émulé, sinon les blocs sous la ligne de
 *    flottaison restent à `opacity: 0` — `Reveal` ne les révèle qu'à
 *    l'intersection, qui n'arrive jamais dans une page jamais défilée ;
 *  - la surcouche de `next dev` (`nextjs-portal`) est masquée, sinon la pastille
 *    de développement se retrouve incrustée dans la vitrine publique ;
 *  - on attend les polices *et* les images avant de déclencher l'obturateur.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { encode } from 'next-auth/jwt'
import { db } from '../src/lib/db'

const SECRET = process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production'

/**
 * Cadre de la capture. Le rapport doit rester celui qu'attend `BrowserFrame`
 * (`aspect-[909/540]`), sinon `object-cover` rogne l'image dans le cadre.
 * On rend à une largeur de bureau franche et on capture à 1,5× : la vitrine
 * sert l'image jusqu'à 1280 px de large sur écran dense, qu'une source de
 * 909 px ne pouvait pas remplir.
 */
const VIEWPORT = { width: 1212, height: 720, scale: 1.5 }

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
  const userDataDir = mkdtempSync(join(tmpdir(), 'nk-captures-'))
  const child = spawn(
    findChrome(),
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
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
async function cookieFor(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      adminRole: true,
      sessionsValidAfter: true,
      trainerProfile: { select: { id: true } },
    },
  })

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
  return { value, email: user.email, name: user.fullName }
}

// ───────────────────────── choix du figurant ─────────────────────────

/**
 * L'apprenant mis en scène. On prend celui qui a le plus d'achats réussis :
 * c'est le seul dont le tableau de bord montre autre chose qu'un état vide, et
 * une vitrine qui annonce « reprenez où vous en étiez » sur un espace vide se
 * dément toute seule.
 */
async function pickLearner() {
  const grouped = await db.purchase.groupBy({
    by: ['learnerId'],
    where: { providerStatus: 'SUCCEEDED', courseId: { not: null }, refundedAt: null },
    _count: { _all: true },
    orderBy: { _count: { learnerId: 'desc' } },
    take: 1,
  })
  const learnerId = grouped[0]?.learnerId
  if (!learnerId) {
    throw new Error(
      "Aucun apprenant n'a d'achat réussi en base — lancer `bun prisma/seed.ts` avant de capturer.",
    )
  }
  return { learnerId, purchases: grouped[0]!._count._all }
}

/**
 * La fiche mise en scène : une ressource publiée que l'apprenant ne possède
 * **pas**, sinon l'écran affiche « Continuer » au lieu du bloc d'achat que la
 * légende de la vitrine décrit.
 */
async function pickCourse(learnerId: string) {
  const owned = await db.purchase.findMany({
    where: { learnerId, courseId: { not: null } },
    select: { courseId: true },
  })
  const ownedIds = owned.map((p) => p.courseId!).filter(Boolean)

  const course = await db.course.findFirst({
    where: { status: 'published', id: { notIn: ownedIds } },
    select: { slug: true, title: true, priceFcfa: true },
    orderBy: { purchases: { _count: 'desc' } },
  })
  if (!course) {
    throw new Error(
      "Aucune ressource publiée non possédée — impossible de capturer la fiche d'achat.",
    )
  }
  return course
}

// ───────────────────────── préparation de la page ─────────────────────────

/**
 * Posé **avant** le chargement du document, donc valable dès la première
 * peinture : ni la surcouche de `next dev` ni un éventuel reliquat de la
 * bannière d'installation ne doivent se retrouver dans une image qui prétend
 * montrer le produit.
 */
const MASQUER = /* css */ `
  nextjs-portal, #nextjs-devtools, [data-nextjs-toast], [data-nextjs-dev-tools-button],
  [role="dialog"][aria-labelledby="nk-install-title"] {
    display: none !important;
  }
`

/**
 * Clé et fenêtre de `src/components/pwa/install-prompt.tsx`. La poser fait
 * rendre `null` au composant plutôt que de le masquer après coup : la bannière
 * est en `fixed`, mais elle monte un `role="dialog"` que la capture n'a aucune
 * raison de contenir. Si la clé ou le délai changent là-bas, le sélecteur
 * ci-dessus reste le filet de sécurité.
 */
const INSTALL_DISMISSED_KEY = 'nkamva:install-dismissed'

/** Exécuté dans la page : rend la main quand il n'y a plus rien à attendre. */
const SETTLED = /* js */ `(async () => {
  await document.fonts.ready;
  const images = Array.from(document.images);
  await Promise.all(
    images.map((img) =>
      img.complete
        ? null
        : new Promise((r) => {
            img.addEventListener('load', r, { once: true });
            img.addEventListener('error', r, { once: true });
          }),
    ),
  );
  return {
    titre: (document.querySelector('h1')?.textContent || '').trim().slice(0, 60),
    filDAriane: Array.from(
      document.querySelectorAll(\`nav[aria-label="Fil d'Ariane"] a, nav[aria-label="Fil d'Ariane"] span\`),
    )
      .map((n) => (n.textContent || '').trim())
      .filter(Boolean)
      .join(' › '),
    // Ce qui traîne par-dessus le contenu et n'a rien à faire dans la vitrine.
    // Compter les nœuds ne suffit pas : \`nextjs-portal\` reste dans le DOM une
    // fois masqué, et l'alarme se déclencherait sur chaque écran sain.
    surcouches: Array.from(document.querySelectorAll('[role="dialog"], nextjs-portal'))
      .filter((n) => {
        const r = n.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== 'hidden';
      })
      .map((n) => n.tagName.toLowerCase())
      .join(', '),
    imagesEnEchec: images.filter((i) => i.complete && i.naturalWidth === 0).length,
    hauteur: document.documentElement.scrollHeight,
  };
})()`

// ───────────────────────── pilotage ─────────────────────────

type Screen = { fichier: string; path: string; legende: string }

async function main() {
  const args = process.argv.slice(2)
  /**
   * Un drapeau sans valeur est une erreur, pas un défaut : `--out` avalé par un
   * shell (variable vide) retombait sinon sur `public/shots` et écrasait les
   * images de production alors qu'on demandait une relecture à côté.
   */
  const at = (flag: string) => {
    if (!args.includes(flag)) return undefined
    const value = args[args.indexOf(flag) + 1]
    if (!value || value.startsWith('--')) throw new Error(`${flag} attend une valeur.`)
    return value
  }
  const base = at('--base')?.startsWith('http')
    ? at('--base')!
    : process.env.SNAPSHOT_BASE_URL || 'http://localhost:3000'
  const outDir = at('--out') || 'public/shots'
  mkdirSync(outDir, { recursive: true })

  const { learnerId, purchases } = await pickLearner()
  const learner = await cookieFor(learnerId)
  const course = await pickCourse(learnerId)

  console.log(`Base       : ${base}`)
  console.log(`Sortie     : ${outDir}`)
  console.log(`Apprenant  : ${learner.name ?? '—'} <${learner.email}>  (${purchases} achat(s))`)
  console.log(`Fiche      : ${course.title} — ${course.priceFcfa} FCFA  (/${course.slug})`)
  console.log(
    `Cadre      : ${VIEWPORT.width}×${VIEWPORT.height} à ${VIEWPORT.scale}× → ` +
      `${VIEWPORT.width * VIEWPORT.scale}×${VIEWPORT.height * VIEWPORT.scale}\n`,
  )

  const screens: Screen[] = [
    {
      fichier: 'catalogue-new.png',
      path: '/catalogue',
      legende: 'Payez à l’unité, gardez l’accès à vie',
    },
    {
      fichier: 'fiche-new.png',
      path: `/catalogue/ressource/${course.slug}`,
      legende: 'Ce que vous achetez, sans surprise',
    },
    {
      fichier: 'dashboard-new.png',
      path: '/accueil',
      legende: 'Reprenez où vous en étiez',
    },
  ]

  const { cdp, stop } = await launchChrome()
  const problemes: string[] = []

  try {
    const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', {
      url: 'about:blank',
    })
    const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', {
      targetId,
      flatten: true,
    })
    await cdp.send('Page.enable', {}, sessionId)
    await cdp.send('Network.enable', {}, sessionId)
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId)
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      {
        width: VIEWPORT.width,
        height: VIEWPORT.height,
        deviceScaleFactor: VIEWPORT.scale,
        mobile: false,
      },
      sessionId,
    )
    // Sans ça, `Reveal` laisse à `opacity: 0` tout ce qui n'a jamais croisé la
    // ligne de flottaison — la moitié basse de l'image sortirait blanche.
    await cdp.send(
      'Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] },
      sessionId,
    )
    await cdp.send(
      'Page.addScriptToEvaluateOnNewDocument',
      {
        source: `(() => {
          try {
            localStorage.setItem(${JSON.stringify(INSTALL_DISMISSED_KEY)}, String(Date.now()));
          } catch {}
          const poser = () => {
            const style = document.createElement('style');
            style.textContent = ${JSON.stringify(MASQUER)};
            document.head.appendChild(style);
          };
          if (document.head) poser();
          else document.addEventListener('DOMContentLoaded', poser, { once: true });
        })()`,
      },
      sessionId,
    )

    const host = new URL(base).hostname
    await cdp.send('Network.clearBrowserCookies', {}, sessionId)
    await cdp.send(
      'Network.setCookie',
      { name: 'next-auth.session-token', value: learner.value, domain: host, path: '/' },
      sessionId,
    )

    for (const screen of screens) {
      const loaded = cdp.once('Page.loadEventFired')
      await cdp.send('Page.navigate', { url: `${base}${screen.path}` }, sessionId)
      await loaded
      // Les écrans connectés s'hydratent juste après `load`.
      await new Promise((r) => setTimeout(r, 600))

      const { result } = await cdp.send<{ result: { value: any } }>(
        'Runtime.evaluate',
        { expression: SETTLED, returnByValue: true, awaitPromise: true },
        sessionId,
      )
      const info = result.value

      const { data } = await cdp.send<{ data: string }>(
        'Page.captureScreenshot',
        {
          format: 'png',
          captureBeyondViewport: false,
          // `scale: 1`, et non `VIEWPORT.scale` : le facteur d'échelle du clip
          // se **multiplie** à celui de l'émulation. Les reprendre tous les
          // deux rendait des images en 2,25×, plus lourdes sans un pixel de
          // détail en plus.
          clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height, scale: 1 },
        },
        sessionId,
      )
      const buffer = Buffer.from(data, 'base64')
      writeFileSync(join(outDir, screen.fichier), buffer)

      const ok = info.titre && !info.imagesEnEchec && !info.surcouches
      console.log(
        `${ok ? '✅' : '❌'} ${screen.fichier.padEnd(20)} ${screen.path}\n` +
          `   titre      : ${info.titre || '(aucun h1)'}\n` +
          `   ariane     : ${info.filDAriane || '—'}\n` +
          `   poids      : ${(buffer.length / 1024).toFixed(0)} Ko` +
          (info.imagesEnEchec ? `  ⚠ ${info.imagesEnEchec} image(s) en échec` : '') +
          (info.surcouches ? `  ⚠ surcouche visible : ${info.surcouches}` : '') +
          '\n',
      )

      if (!info.titre) problemes.push(`${screen.path} : aucun \`h1\` — écran vide ou en erreur ?`)
      if (info.imagesEnEchec) {
        problemes.push(`${screen.path} : ${info.imagesEnEchec} image(s) non chargée(s)`)
      }
      if (info.surcouches) {
        problemes.push(`${screen.path} : surcouche visible sur le contenu — ${info.surcouches}`)
      }
    }
  } finally {
    cdp.close()
    stop()
  }

  if (problemes.length) {
    console.log(`❌ ${problemes.length} anomalie(s) :`)
    for (const p of problemes) console.log(`   · ${p}`)
    process.exit(1)
  }
  console.log(`✅ ${screens.length} captures écrites dans ${outDir}.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
