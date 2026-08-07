/**
 * Rapport d'atteignabilité — ce qui existe sans être appelable depuis l'écran.
 *
 *   bun scripts/orphans.ts
 *
 * Le garde-fou, lui, est dans `tests/atteignabilite.test.ts` : il n'échoue que
 * sur les routes, et seulement sur celles qui ne sont pas dans la liste des
 * exceptions assumées. Ce script montre le reste — méthodes HTTP jamais
 * appelées, exports de `src/lib` sans consommateur — qui relève du jugement et
 * non d'une règle automatique.
 *
 * La logique de balayage vit dans `tests/reachability.ts`, avec le test : deux
 * copies divergeraient, et c'est le garde-fou qui perdrait.
 */
import { readFileSync } from 'node:fs'
import { scanRoutes, scanLibExports, isExternallyCalled } from '../tests/reachability'
import { KNOWN_UNREACHABLE } from '../tests/known-unreachable'

const routes = scanRoutes()
const known = new Map(KNOWN_UNREACHABLE.map((k) => [k.path, k.reason]))

console.log(`── ${routes.length} routes d'API ──\n`)

const unreachable = routes.filter((r) => r.callers.length === 0 && !isExternallyCalled(r.path))
let offList = 0

for (const route of unreachable) {
  const reason = known.get(route.path)
  console.log(
    `${reason ? 'dette assumée  ' : 'NON ATTEIGNABLE'} ${route.methods.join(',').padEnd(14)} ${route.path}`,
  )
  if (reason) {
    console.log(`                ↳ ${reason}`)
    continue
  }
  offList++
  if (route.otherReferences.length) {
    // Le piège dans lequel les trois cas d'origine sont tombés : testée, donc
    // réputée branchée.
    console.log(`                ↳ référencée hors produit : ${route.otherReferences.join(', ')}`)
  }
}

console.log(
  `\n${routes.length - unreachable.length} atteignable(s), ` +
    `${unreachable.length - offList} dette(s) assumée(s), ` +
    `${offList} hors liste.\n`,
)

// Les méthodes ne sont pas mises sous garde-fou : « le fichier appelant contient
// `api.patch` » ne prouve pas qu'il vise CETTE route. Heuristique utile à l'œil,
// indigne d'un test qui ferait échouer la suite.
console.log('── Méthodes probablement jamais appelées (heuristique) ──\n')
const VERBS: Record<string, string> = { POST: 'post', PATCH: 'patch', PUT: 'put', DELETE: 'del' }
for (const route of routes) {
  if (route.callers.length === 0) continue
  // Un webhook n'est appelé par aucun `api.post` du dépôt : le fournisseur s'en
  // charge. L'y faire figurer noierait les vrais cas.
  if (isExternallyCalled(route.path)) continue
  const callerText = route.callers.map((f) => readFileSync(f, 'utf8')).join('\n')
  const unused = route.methods.filter((method) => {
    const verb = VERBS[method]
    if (!verb) return false
    return !new RegExp(`api\\.${verb}\\b|method:\\s*['"\`]${method}`, 'i').test(callerText)
  })
  if (unused.length) console.log(`${unused.join(',').padEnd(14)} ${route.path}`)
}

const libExports = scanLibExports()
console.log(`\n── ${libExports.length} exports de src/lib sans consommateur externe ──\n`)
for (const e of libExports) console.log(`${e.file.padEnd(40)} ${e.name}`)
console.log(
  '\nUne constante sans consommateur ne coûte rien ; une fonction jamais appelée est ' +
    'une fonctionnalité qui ne tourne jamais. Ce rapport ne tranche pas — il montre.',
)
