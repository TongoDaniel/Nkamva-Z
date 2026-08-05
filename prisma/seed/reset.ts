// ==========================================================================
// Remise à plat des données applicatives
// ==========================================================================
// Le jeu de démonstration reconstitue de vraies machines à états — une
// candidature qui devient un profil, un retrait qui passe en revue puis au
// versement, un litige qui se résout. Aucune de ces chaînes n'est rejouable
// sur une base déjà peuplée : `approveApplication` crée le profil, elle ne le
// met pas à jour, et `requestPayout` refuse un second retrait en vol.
//
// D'où la purge. Elle porte sur les **données**, jamais sur le schéma : les
// tables restent, les migrations aussi. `prisma migrate` n'a rien à rejouer
// après un passage ici.
// ==========================================================================

import { db } from '../../src/lib/db'

/** Tables que la purge ne doit jamais toucher, quel que soit le schéma. */
const PRESERVED = new Set(['_prisma_migrations'])

/**
 * Vide toutes les tables applicatives en une seule instruction.
 *
 * Un `TRUNCATE` groupé plutôt qu'une cascade de `deleteMany` ordonnés : les
 * clés étrangères de ce schéma sont majoritairement en `Restrict`, l'ordre de
 * suppression serait donc à maintenir à la main à chaque nouveau modèle — et
 * une seule omission laisserait des lignes orphelines que le seed suivant
 * heurterait sans qu'on comprenne pourquoi. `CASCADE` sur la liste complète
 * n'a pas cet angle mort.
 */
export async function resetApplicationData(): Promise<{ tables: number }> {
  // La liste vient du catalogue Postgres, pas d'une constante recopiée : un
  // modèle ajouté au schéma est purgé sans que personne ait à y penser.
  const rows = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `

  const tables = rows.map((r) => r.tablename).filter((name) => !PRESERVED.has(name))
  if (tables.length === 0) return { tables: 0 }

  const list = tables.map((name) => `"public"."${name}"`).join(', ')
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)

  return { tables: tables.length }
}
