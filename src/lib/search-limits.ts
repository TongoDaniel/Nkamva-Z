// ==========================================================================
// Seuils de recherche — module pur, lisible des deux côtés de la frontière
// ==========================================================================
// `lib/search.ts` importe `db`. Un composant client qui voudrait seulement
// connaître le seuil de déclenchement y tirerait Prisma dans le paquet du
// navigateur : d'où ce module, qui ne contient que des nombres.
//
// `search.ts` les réexporte, pour que les appelants serveur déjà en place
// n'aient pas à changer d'adresse.
// ==========================================================================

/** En deçà, la recherche renvoie du bruit plutôt que des résultats. */
export const SEARCH_MIN_LENGTH = 2

/**
 * Délai d'amortissement d'une recherche à la frappe, en millisecondes.
 *
 * 300 ms : au-dessous, une saisie normale part en rafale de requêtes et se fait
 * couper par le plafond de débit ; au-dessus, la frappe paraît collante. La
 * base de dev répondant à 223 ms, l'attente ressentie ici est le trajet
 * réseau, pas ce délai.
 */
export const SEARCH_DEBOUNCE_MS = 300
