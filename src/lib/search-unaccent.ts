// ==========================================================================
// Recherche insensible aux accents, côté base — campagne du 12 octobre 2026, m6
// ==========================================================================
// `searchAnyOf` retire les accents de la saisie : « rôbe » trouve « robe ».
// L'inverse demande de les retirer aussi du texte stocké, ce que Prisma ne sait
// pas exprimer. Ces requêtes le font avec l'extension `unaccent` et rendent les
// identifiants trouvés, que l'appelant ajoute à son `OR` : les filtres Prisma
// (visibilité, statut, circuit) restent la seule source de vérité.
//
// Les colonnes sont écrites en dur, une requête par entité : aucun nom de
// colonne ne vient de l'appelant.
// ==========================================================================

import { Prisma } from '@prisma/client'
import { db } from './db'
import { escapeLike } from './search-text'

/** Le motif `LIKE` d'une saisie : sans accents, en minuscules, jokers échappés. */
function pattern(raw: string): string | null {
  const term = raw.trim()
  if (!term) return null
  return `%${escapeLike(term)}%`
}

/** `unaccent(lower(colonne)) LIKE unaccent(lower(motif))`, avec l'échappement de `escapeLike`. */
function matches(column: Prisma.Sql, like: string): Prisma.Sql {
  return Prisma.sql`unaccent(lower(${column})) LIKE unaccent(lower(${like})) ESCAPE '\\'`
}

async function ids(query: Prisma.Sql): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>(query)
  return rows.map((row) => row.id)
}

/** La branche d'`OR` qui reprend ces identifiants, ou rien s'il n'y en a pas. */
export function idsBranch(found: string[]): { id: { in: string[] } }[] {
  return found.length > 0 ? [{ id: { in: found } }] : []
}

export type CourseSearchField = 'title' | 'blurb' | 'description' | 'category'

const COURSE_COLUMNS: Record<CourseSearchField, Prisma.Sql> = {
  title: Prisma.sql`c."title"`,
  blurb: Prisma.sql`c."blurb"`,
  description: Prisma.sql`c."description"`,
  category: Prisma.sql`c."category"`,
}

/** Les ressources dont l'un des champs contient la saisie, accents ignorés. */
export async function courseIdsMatching(raw: string, fields: CourseSearchField[]): Promise<string[]> {
  const like = pattern(raw)
  if (!like || fields.length === 0) return []
  const any = Prisma.join(fields.map((field) => matches(COURSE_COLUMNS[field], like)), ' OR ')
  return ids(Prisma.sql`SELECT c."id" FROM "courses" c WHERE ${any}`)
}

/** Les communautés dont le nom ou la description contient la saisie, accents ignorés. */
export async function communityIdsMatching(raw: string): Promise<string[]> {
  const like = pattern(raw)
  if (!like) return []
  return ids(Prisma.sql`
    SELECT c."id" FROM "communities" c
    WHERE ${matches(Prisma.sql`c."name"`, like)}
       OR ${matches(Prisma.sql`coalesce(c."description", '')`, like)}`)
}

/** Les profils formateur dont le nom ou le slogan contient la saisie, accents ignorés. */
export async function trainerProfileIdsMatching(raw: string): Promise<string[]> {
  const like = pattern(raw)
  if (!like) return []
  return ids(Prisma.sql`
    SELECT t."id" FROM "trainer_profiles" t
    JOIN "users" u ON u."id" = t."userId"
    WHERE ${matches(Prisma.sql`coalesce(u."fullName", '')`, like)}
       OR ${matches(Prisma.sql`coalesce(t."slogan", '')`, like)}`)
}
