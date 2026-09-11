// ==========================================================================
// Règles d'une ressource, côté serveur comme côté formulaire
// ==========================================================================
// Module pur, à dessein. `lib/courses.ts` importe `db` : le formulaire de
// publication, qui est un composant client, ne peut pas y lire une constante
// sans tirer Prisma dans le paquet du navigateur. Il lisait donc sa propre
// copie du prix plancher, et le serveur la sienne — un `500` écrit en dur.
//
// Deux nombres identiques dans deux fichiers qui ne se parlent pas, c'est la
// divergence garantie le jour où l'un des deux bouge : le formulaire accepte,
// le serveur refuse, et la personne voit une erreur qu'aucun message n'explique.
// ==========================================================================

/** Prix plancher d'une ressource **vendue à l'unité**. */
export const MIN_COURSE_PRICE_FCFA = 500

/**
 * Où va une ressource. Miroir de l'enum `CourseCircuit` de Prisma, écrit ici en
 * littéraux : importer le type généré ferait entrer `@prisma/client` dans le
 * graphe du client.
 */
export type CourseCircuitValue = 'MARKETPLACE' | 'COMMUNITY'

/**
 * Les deux destinations, telles qu'on les propose au formateur.
 *
 * Arbitrage 47 — elles sont **exclusives** : une ressource incluse dans une
 * communauté n'est pas vendue à l'unité, et l'achat d'une ressource au circuit
 * communautaire est refusé (`COURSE_NOT_FOR_SALE`). Le prix n'a donc aucun sens
 * de ce côté-là, et le formulaire ne le demande pas.
 */
export const COURSE_CIRCUITS = [
  {
    value: 'MARKETPLACE',
    label: 'Au catalogue, vendue à l’unité',
    hint: 'Visible de tous, achetée une fois, pour toujours.',
  },
  {
    value: 'COMMUNITY',
    label: 'Incluse dans ma communauté',
    hint: 'Réservée à vos abonnés, sans achat à l’unité — vous ne fixez pas de prix.',
  },
] as const satisfies ReadonlyArray<{ value: CourseCircuitValue; label: string; hint: string }>

/**
 * Jusqu'où la destination reste modifiable.
 *
 * Amendement à l'arbitrage 137, qui protège ce qui a été **annoncé comme
 * inclus** : délier ne remet pas une ressource en vente, parce que des membres
 * l'ont vue dans leur offre. Un **brouillon jamais publié et jamais acheté**
 * n'a rien annoncé à personne — s'y tromper ne doit pas enfermer la ressource
 * hors de la vente pour toujours.
 *
 * Publiée, ou vendue une seule fois, elle se fige : c'est là que 137 reprend
 * la main.
 */
export function circuitIsStillOpen(course: {
  status: string
  publishedAt: Date | null
  purchaseCount: number
}): boolean {
  return course.status === 'draft' && course.publishedAt === null && course.purchaseCount === 0
}
