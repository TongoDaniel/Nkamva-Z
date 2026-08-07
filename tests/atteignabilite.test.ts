// ==========================================================================
// Garde-fou : aucune route d'API ne doit être inatteignable en silence
// ==========================================================================
// Ce test ne touche ni la base ni le serveur — il lit le dépôt. Il n'importe
// donc pas `./setup` : ouvrir une connexion Prisma pour relire des fichiers
// serait le seul effet de bord de la suite qui ne prouve rien.
//
// Ce qu'il empêche : livrer une fonctionnalité complète côté serveur — route,
// fonction, tests, écran d'instruction en back-office — sans le point d'entrée
// qui permet de s'en servir. Trois cas existaient au moment de l'écrire, tous
// les trois couverts par des tests verts. Un test qui appelle le gestionnaire
// prouve que la route marche ; il ne prouve pas qu'on peut y arriver.
// ==========================================================================

import { describe, it, expect } from 'vitest'
import { scanRoutes, isExternallyCalled, EXTERNALLY_CALLED } from './reachability'
import { KNOWN_UNREACHABLE } from './known-unreachable'

const routes = scanRoutes()
const known = new Map(KNOWN_UNREACHABLE.map((k) => [k.path, k.reason]))

describe('Atteignabilité des routes d\'API', () => {
  it('le balayage trouve bien les routes du dépôt', () => {
    // Un balayeur qui ne trouve plus rien passerait au vert en ne protégeant
    // plus rien : c'est le mode de défaillance le plus dangereux d'un garde-fou.
    expect(routes.length).toBeGreaterThan(80)
    expect(routes.every((r) => r.methods.length > 0)).toBe(true)
  })

  it('aucune route hors liste n\'est sans appelant', () => {
    const orphans = routes.filter(
      (route) =>
        route.callers.length === 0 &&
        !isExternallyCalled(route.path) &&
        !known.has(route.path),
    )

    expect(
      orphans.map((o) => `${o.methods.join(',')} ${o.path}`),
      "Ces routes existent sans qu'aucun fichier de src/ ne les adresse. Deux issues, " +
        'et une seule est bonne : brancher le point d\'entrée qui manque, ou — si ' +
        'l\'absence est délibérée — l\'inscrire dans tests/known-unreachable.ts avec ' +
        'son motif. Un test vert obtenu en élargissant la liste sans raison écrite ne ' +
        'protège plus personne.',
    ).toEqual([])
  })

  it('la liste des dettes ne contient pas de route disparue', () => {
    const paths = new Set(routes.map((r) => r.path))
    const gone = KNOWN_UNREACHABLE.filter((k) => !paths.has(k.path)).map((k) => k.path)

    expect(
      gone,
      'Ces entrées visent une route qui n\'existe plus : les retirer de ' +
        'tests/known-unreachable.ts. Une exception qui vise à côté ne se voit pas, ' +
        'et couvre la suivante.',
    ).toEqual([])
  })

  it('la liste des dettes ne garde pas une route devenue atteignable', () => {
    const wired = routes
      .filter((route) => known.has(route.path) && route.callers.length > 0)
      .map((route) => `${route.path} (appelée depuis ${route.callers[0]})`)

    expect(
      wired,
      'Ces routes sont désormais branchées : retirer leur entrée de ' +
        'tests/known-unreachable.ts. C\'est ce contrôle qui fait que la dette se ' +
        'solde au lieu de s\'oublier.',
    ).toEqual([])
  })

  it('chaque motif d\'appel externe correspond à des routes réelles', () => {
    for (const { pattern, why } of EXTERNALLY_CALLED) {
      expect(
        routes.some((r) => pattern.test(r.path)),
        `Aucune route ne correspond à ${pattern} (« ${why} ») : motif à retirer.`,
      ).toBe(true)
    }
  })

  it('la liste des dettes est sans doublon', () => {
    const seen = new Set<string>()
    const duplicates = KNOWN_UNREACHABLE.filter((k) => !seen.add(k.path)).map((k) => k.path)
    expect(duplicates).toEqual([])
  })

  it('chaque dette porte un motif lisible', () => {
    const vague = KNOWN_UNREACHABLE.filter((k) => k.reason.trim().length < 30).map((k) => k.path)
    expect(
      vague,
      'Un motif d\'une ligne creuse ne dit pas à la prochaine personne si l\'entrée ' +
        'peut être retirée. Écrire pourquoi la route n\'a pas d\'appelant, et ce qu\'il ' +
        'faudrait pour qu\'elle en ait un.',
    ).toEqual([])
  })
})
