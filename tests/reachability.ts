// ==========================================================================
// Atteignabilité — ce qui existe côté serveur sans être appelable depuis l'écran
// ==========================================================================
// Ce module ne teste rien : il relève. `tests/atteignabilite.test.ts` en fait un
// garde-fou, `scripts/orphans.ts` en fait un rapport.
//
// Le défaut qu'il cherche ne se voit nulle part ailleurs. Le typecheck passe,
// les tests unitaires passent, l'écran s'affiche — et pourtant la fonctionnalité
// est inatteignable. Trois cas rencontrés le 7 août 2026 :
//
//   · `listAuditActions()` existait avec le commentaire « pour alimenter un
//     filtre honnête », et aucun filtre ne l'appelait ;
//   · `POST /api/reports` était complet, testé, avec sa file d'instruction en
//     back-office, et aucun écran ne postait dessus ;
//   · `POST /api/me/disputes/attachments/upload` de même, avec en prime un job
//     planifié qui nettoyait des pièces que personne ne pouvait déposer.
//
// **Définition retenue : atteignable = un fichier de `src/` l'adresse par son
// URL.** Ni un test qui importe le gestionnaire, ni un script de smoke qui
// l'appelle en HTTP ne comptent — ils prouvent que la route fonctionne, pas
// qu'un utilisateur peut y arriver. C'est exactement la confusion qui a laissé
// passer les trois cas ci-dessus : tous les trois étaient testés.
// ==========================================================================

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|mjs)$/.test(entry)) out.push(full)
  }
  return out
}

const posix = (file: string) => relative(ROOT, file).split(sep).join('/')

/**
 * Le balayeur et sa liste d'exceptions citent des chemins d'API dans leurs
 * commentaires. Sans cette exclusion, ils se compteraient eux-mêmes comme
 * référence et une route entrée dans la liste des dettes en sortirait
 * « référencée hors produit » — un outil qui se voit dans son propre miroir.
 */
const SELF = ['tests/reachability.ts', 'tests/known-unreachable.ts', 'tests/atteignabilite.test.ts']

export interface RouteScan {
  /** Chemin d'URL, `[param]` compris. */
  path: string
  file: string
  methods: string[]
  /** Fichiers de `src/` (hors `src/app/api/`) qui l'adressent par son URL. */
  callers: string[]
  /** Références hors produit : tests, scripts, seed. Jamais de l'atteignabilité. */
  otherReferences: string[]
}

/**
 * Routes appelées depuis l'extérieur : elles n'auront jamais d'appelant interne,
 * et c'est leur nature, pas une dette.
 */
export const EXTERNALLY_CALLED: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /^\/api\/webhooks\//, why: 'appelée par le fournisseur (Stripe, Mux, PawaPay)' },
  { pattern: /^\/api\/auth\//, why: 'gérée par next-auth' },
]

/**
 * `/api/x/[id]` est écrit `/api/x/${id}` par l'appelant : on cherche le préfixe
 * statique. Un chemin entièrement statique exige un terminateur — sans lui,
 * `/api/me/resources` passerait pour atteignable à cause d'une référence à
 * `/api/me/resources/${id}/content`, qui est une **autre** route.
 */
function referencesRoute(content: string, path: string): boolean {
  const firstDynamic = path.indexOf('/[')
  if (firstDynamic !== -1) return content.includes(path.slice(0, firstDynamic + 1))
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escaped}(['"\`?])`).test(content)
}

export function scanRoutes(): RouteScan[] {
  const src = walk(join(ROOT, 'src'))
  const outside = [
    ...walk(join(ROOT, 'scripts')),
    ...walk(join(ROOT, 'tests')),
    ...walk(join(ROOT, 'prisma')),
  ].filter((f) => !SELF.includes(posix(f)))

  const routeFiles = src.filter((f) => /src[\\/]app[\\/]api[\\/].*route\.ts$/.test(f))
  // Une route qui en appelle une autre serait une boucle réseau interne : on ne
  // compte donc pas `src/app/api/**` comme appelant, et un chemin cité dans le
  // commentaire d'une route voisine ne la fait pas passer pour branchée.
  const productFiles = src.filter((f) => !posix(f).startsWith('src/app/api/'))

  const read = new Map<string, string>()
  const contentOf = (f: string) => {
    let c = read.get(f)
    if (c === undefined) {
      c = readFileSync(f, 'utf8')
      read.set(f, c)
    }
    return c
  }

  return routeFiles.map((file) => {
    const body = contentOf(file)
    const path =
      '/' + posix(file).replace(/^src\/app\//, '').replace(/\/route\.ts$/, '')
    return {
      path,
      file: posix(file),
      methods: methodsOf(body),
      callers: productFiles.filter((f) => referencesRoute(contentOf(f), path)).map(posix),
      otherReferences: outside
        .filter((f) => referencesRoute(contentOf(f), path))
        .map(posix),
    }
  })
}

const HTTP_METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD'] as const

/**
 * Next reconnaît un gestionnaire à son nom d'export, quelle qu'en soit la
 * forme. Les trois existent dans ce dépôt, et n'en lire qu'une ferait passer
 * une route pour vide — donc pour non concernée par les contrôles.
 */
function methodsOf(body: string): string[] {
  const found = new Set<string>()
  const verbs = HTTP_METHODS.join('|')

  // 1. `export async function POST(…)` — la forme courante ici.
  for (const m of body.matchAll(new RegExp(`export\\s+(?:async\\s+)?function\\s+(${verbs})\\b`, 'g'))) {
    found.add(m[1])
  }
  // 2. `export const POST = …`
  for (const m of body.matchAll(new RegExp(`export\\s+const\\s+(${verbs})\\b`, 'g'))) {
    found.add(m[1])
  }
  // 3. `export { handler as GET, handler as POST }` — la route next-auth.
  for (const block of body.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const m of block[1].matchAll(new RegExp(`(?:\\bas\\s+)?\\b(${verbs})\\b`, 'g'))) {
      found.add(m[1])
    }
  }
  return [...found]
}

export function isExternallyCalled(path: string): string | null {
  return EXTERNALLY_CALLED.find((e) => e.pattern.test(path))?.why ?? null
}

export interface ExportScan {
  file: string
  name: string
}

/**
 * Exports de `src/lib` que personne ne nomme hors de leur propre fichier.
 *
 * Rendu à titre de rapport, **jamais** transformé en test : la liste contient
 * une trentaine de constantes exportées pour la lisibilité, dont l'absence de
 * consommateur ne coûte rien. Un garde-fou qui crie trente fois pour un vrai
 * défaut n'est plus lu, et c'est pire que pas de garde-fou.
 */
export function scanLibExports(): ExportScan[] {
  const files = [
    ...walk(join(ROOT, 'src')),
    ...walk(join(ROOT, 'scripts')),
    ...walk(join(ROOT, 'tests')),
    ...walk(join(ROOT, 'prisma')),
  ]
  const content = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]))
  const libFiles = files.filter((f) => /src[\\/]lib[\\/]/.test(f) && f.endsWith('.ts'))

  const orphans: ExportScan[] = []
  for (const file of libFiles) {
    const body = content.get(file)!
    const names = new Set<string>()
    for (const m of body.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) {
      names.add(m[1])
    }
    for (const m of body.matchAll(/^export\s+const\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1])

    for (const name of names) {
      const word = new RegExp(`\\b${name}\\b`)
      const used = [...content].some(([f, c]) => f !== file && word.test(c))
      if (!used) orphans.push({ file: posix(file), name })
    }
  }
  return orphans.sort((a, b) => `${a.file}${a.name}`.localeCompare(`${b.file}${b.name}`))
}
