// ==========================================================================
// Aucun refus métier ne doit se lire « Erreur »
// ==========================================================================
// Le motif se répétait : une route énumérait à la main les codes qu'elle savait
// traduire, un service en ajoutait un plus tard, et personne ne revenait
// allonger la liste. Le refus tombait alors dans le repli 500 — l'utilisateur
// lisait « Erreur » là où le service disait précisément quoi faire.
//
// Ce garde-fou relit les routes plutôt que de faire confiance : pour chaque
// handler, il rassemble les codes que ses services peuvent lever, et vérifie
// qu'aucun ne se perd. Un code est couvert quand la route le nomme
// explicitement, ou quand elle relaie l'inconnu vers la table partagée
// (`errorFromException` / `domainErrorResponse`) et que la table le connaît.
//
// Ce test ne tient pas de liste : ajouter un `throw new Error('CODE')` dans un
// service suffit à le faire échouer si rien ne traduit ce code. C'est le but.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const rel = (f: string) => path.relative(process.cwd(), f).split(path.sep).join('/')

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.ts')) out.push(p)
  }
  return out
}

/** Les codes que `DOMAIN_ERRORS` sait nommer. */
function domainTable(): Set<string> {
  const src = fs.readFileSync('src/lib/api.ts', 'utf8')
  const start = src.indexOf('const DOMAIN_ERRORS')
  const body = src.slice(start, src.indexOf('\n}', start))
  return new Set([...body.matchAll(/^ {2}([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]))
}

/**
 * Ce que chaque fonction de `src/lib` peut lever, appels internes compris.
 *
 * Le découpage suit les déclarations de premier niveau — helpers non exportés
 * inclus, sinon leurs `throw` seraient mis au compte de la fonction exportée
 * qui les précède, et le compte serait faux dans les deux sens.
 */
function thrownByFunction(): Map<string, Set<string>> {
  const throws = new Map<string, Set<string>>()
  const calls = new Map<string, Set<string>>()
  const DECL =
    /^(?:export )?(?:async )?function ([A-Za-z0-9_]+)\s*[(<]|^(?:export )?const ([A-Za-z0-9_]+)\s*=/gm

  for (const f of walk('src/lib')) {
    const src = fs.readFileSync(f, 'utf8')
    const marks = [...src.matchAll(DECL)].map((m) => ({ name: m[1] || m[2], at: m.index! }))
    for (let i = 0; i < marks.length; i++) {
      const body = src.slice(marks[i].at, i + 1 < marks.length ? marks[i + 1].at : src.length)
      const name = marks[i].name
      if (!throws.has(name)) {
        throws.set(name, new Set())
        calls.set(name, new Set())
      }
      for (const m of body.matchAll(/throw new Error\('([A-Z][A-Z0-9_]+)'\)/g)) throws.get(name)!.add(m[1])
      for (const m of body.matchAll(/\b([a-z][A-Za-z0-9_]*)\s*\(/g)) calls.get(name)!.add(m[1])
    }
  }

  // Propagation jusqu'au point fixe : ce que j'appelle, je le lève aussi.
  for (let pass = 0; pass < 10; pass++) {
    let grew = false
    for (const [name, called] of calls) {
      for (const c of called) {
        if (c === name || !throws.has(c)) continue
        for (const code of throws.get(c)!) {
          if (!throws.get(name)!.has(code)) {
            throws.get(name)!.add(code)
            grew = true
          }
        }
      }
    }
    if (!grew) break
  }
  return throws
}

interface Gap {
  handler: string
  codes: string[]
}

function findGaps(): Gap[] {
  const known = domainTable()
  const throws = thrownByFunction()
  const gaps: Gap[] = []

  for (const f of walk('src/app/api')) {
    if (path.basename(f) !== 'route.ts') continue
    const src = fs.readFileSync(f, 'utf8')

    const imported = new Set<string>()
    for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*'@\/lib\/[^']+'/g)) {
      for (const n of m[1].split(',')) imported.add(n.trim().split(/\s+as\s+/)[0].trim())
    }

    const marks = [...src.matchAll(/export (?:async )?function (GET|POST|PATCH|PUT|DELETE)\s*\(/g)].map(
      (m) => ({ verb: m[1], at: m.index! }),
    )
    for (let i = 0; i < marks.length; i++) {
      const body = src.slice(marks[i].at, i + 1 < marks.length ? marks[i + 1].at : src.length)

      // Un repli maison : sans lui, l'exception remonte et Next rend un 500 nu —
      // il n'y a alors rien à vérifier ici.
      const relays = /errorFromException|domainErrorResponse/.test(body)
      const guards = /INTERNAL_ERROR/.test(body)
      if (!relays && !guards) continue

      // Traité explicitement : comparaison, appel direct, table locale, `case`.
      const handled = new Set<string>()
      for (const m of body.matchAll(/===\s*'([A-Z][A-Z0-9_]+)'/g)) handled.add(m[1])
      for (const m of body.matchAll(/\berror\('([A-Z][A-Z0-9_]+)'/g)) handled.add(m[1])
      for (const m of body.matchAll(/^ *([A-Z][A-Z0-9_]+): *\[/gm)) handled.add(m[1])
      for (const m of body.matchAll(/case '([A-Z][A-Z0-9_]+)'/g)) handled.add(m[1])

      const reachable = new Set<string>()
      for (const n of imported) {
        if (!throws.has(n) || !body.includes(n + '(')) continue
        for (const c of throws.get(n)!) reachable.add(c)
      }

      const lost = [...reachable]
        .filter((c) => !handled.has(c) && (!relays || !known.has(c)))
        .sort()
      if (lost.length) gaps.push({ handler: marks[i].verb + ' ' + rel(f), codes: lost })
    }
  }
  return gaps
}

describe('Traduction des refus métier', () => {
  it('aucune route ne laisse un refus tomber dans son repli 500', () => {
    const gaps = findGaps()
    const report = gaps.map((g) => '  ' + g.handler + '\n      ' + g.codes.join(', ')).join('\n')
    expect(report, 'Ces motifs se liraient « Erreur » côté utilisateur :\n' + report).toBe('')
  })

  it('la table des erreurs de domaine est bien lue', () => {
    // Si le format de `DOMAIN_ERRORS` change, l'extraction ci-dessus rendrait un
    // ensemble vide et le premier test passerait pour de mauvaises raisons.
    const table = domainTable()
    expect(table.size).toBeGreaterThan(150)
    expect(table.has('CONTENT_REQUIRED')).toBe(true)
    expect(table.has('SUBSCRIPTION_SUSPENDED')).toBe(true)
  })

  it('les throw des services sont bien repérés, propagation comprise', () => {
    // Même précaution : un découpage cassé rendrait des ensembles vides.
    const throws = thrownByFunction()
    expect(throws.get('publishCourse')).toContain('CONTENT_REQUIRED')
    // Levé par `canTrainerWrite`, pas par `publishCourse` : la propagation doit
    // le rattacher, sinon le garde-fou ne voit qu'une partie du terrain.
    expect(throws.get('publishCourse')).toContain('SUBSCRIPTION_SUSPENDED')
  })
})
