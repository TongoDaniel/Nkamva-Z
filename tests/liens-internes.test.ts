// ==========================================================================
// Liens internes écrits dans `src/lib` — chacun doit mener à une page
// ==========================================================================
// Les notifications et les e-mails portent leur lien en chaîne de caractères
// (`link: '/formateur/…'`, `absoluteUrl('/…')`). Rien ne les relie aux pages :
// le typecheck passe, l'écran de la notification s'affiche, et le clic finit
// sur « page introuvable ». Le 28 octobre 2026, quinze liens étaient dans ce
// cas — tous sur des messages d'argent (retrait échoué, moyen de paiement à
// revoir, remboursement manuel, chargeback) — dont `/formateur/paiements`, déjà
// signalé dans un commentaire et corrigé une fois sur neuf.
//
// Ce test ne demande pas de base : il lit les sources et l'arborescence de
// `src/app`.
// ==========================================================================
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()

function walk(dir: string, keep: (file: string) => boolean, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, keep, out)
    else if (keep(path)) out.push(path)
  }
  return out
}

/** Chaque page de `src/app`, en segments ; `null` pour un segment dynamique. */
function pageRoutes(): (string | null)[][] {
  const appDir = join(ROOT, 'src', 'app')
  return walk(appDir, (f) => /[\\/]page\.tsx$/.test(f)).map((file) =>
    relative(appDir, file)
      .split(sep)
      .slice(0, -1)
      // Les groupes `(public)`, `(app)` n'apparaissent pas dans l'URL.
      .filter((segment) => !/^\(.*\)$/.test(segment))
      .map((segment) => (/^\[.*\]$/.test(segment) ? null : segment)),
  )
}

/** Les liens écrits en dur dans `src/lib`, avec leur emplacement. */
function writtenLinks(): { link: string; where: string }[] {
  const found: { link: string; where: string }[] = []
  // `link: '/…'`, `absoluteUrl('/…')`, et les liens rangés dans une variable
  // (`contestLink = …`) : celui des litiges du formateur passait par là.
  const pattern = /(?:link:\s*|absoluteUrl\(\s*|(?:Link|Url|link|url|href|Href)\s*=\s*)(['`])(\/[^'`]*)\1/g
  for (const file of walk(join(ROOT, 'src', 'lib'), (f) => f.endsWith('.ts'))) {
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, index) => {
      for (const match of line.matchAll(pattern)) {
        found.push({ link: match[2], where: `${relative(ROOT, file)}:${index + 1}` })
      }
    })
  }
  return found
}

function reaches(link: string, routes: (string | null)[][]): boolean {
  const path = link.split(/[?#]/)[0].replace(/\/$/, '')
  // Un segment interpolé (`${payoutId}`) vaut n'importe quelle valeur.
  const segments = path.split('/').slice(1).map((s) => (s.includes('${') ? null : s))
  return routes.some(
    (route) =>
      route.length === segments.length &&
      route.every((part, i) => part === null || segments[i] === null || part === segments[i]),
  )
}

describe('Liens internes des notifications et des e-mails', () => {
  const routes = pageRoutes()
  const links = writtenLinks()

  it('en trouve assez pour que le test ait un sens', () => {
    expect(links.length).toBeGreaterThan(30)
  })

  it('mènent tous à une page qui existe', () => {
    const dead = links.filter(({ link }) => !reaches(link, routes))
    expect(dead.map(({ link, where }) => `${where} → ${link}`)).toEqual([])
  })
})
