// ==========================================================================
// Texte de recherche — campagne du 12 octobre 2026, m6
// ==========================================================================
// Prisma traduit `contains` en `ILIKE '%…%'` sans échapper les jokers : `%`
// et `_` tapés dans la recherche renvoyaient tout le catalogue. Et « rôbe » ne
// trouvait pas « robe » : PostgreSQL compare les lettres accentuées telles
// quelles, et l'extension `unaccent` n'est pas installée.
// ==========================================================================

/** Échappe les jokers de `LIKE` (`%`, `_`) et le caractère d'échappement lui-même. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&')
}

export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Les formes à chercher pour une saisie : telle quelle, et sans ses accents si
 * elle en porte, toutes échappées. « rôbe » trouve ainsi « robe ».
 *
 * L'inverse — « robe » qui trouve « rôbe » — se joue côté base, avec l'extension
 * `unaccent` : voir `search-unaccent.ts`.
 */
export function searchForms(raw: string): string[] {
  const term = raw.trim()
  if (!term) return []
  return [...new Set([term, stripAccents(term)])].map(escapeLike)
}

/**
 * Le `OR` Prisma qui cherche chaque forme dans chaque champ. `fields` décrit,
 * pour une forme donnée, les conditions à combiner.
 */
export function searchAnyOf<T>(raw: string, fields: (contains: { contains: string; mode: 'insensitive' }) => T[]): T[] {
  return searchForms(raw).flatMap((form) => fields({ contains: form, mode: 'insensitive' }))
}

/** Un entier lu dans l'URL, ou `undefined` : `maxPrice=abc` rendait une erreur 500. */
export function intParam(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined
  const n = Number(value)
  return Number.isSafeInteger(n) && n >= 0 ? n : undefined
}
