// ==========================================================================
// Sortie et retour au catalogue pour impayé — décision 68, arbitrage 12
// ==========================================================================
// La décision 68 posait que les ressources « sont sorties du catalogue sur
// décision, elles y reviennent sur décision ». L'arbitrage 12 revient dessus :
// **le règlement republie**. Un formateur qui paie retrouve son catalogue sans
// attendre le geste d'un administrateur.
//
// Ce module est minuscule à dessein : trois chemins distincts soldent une
// période — le prélèvement sur solde, le règlement par carte ou mobile money,
// et le constat manuel de Finances — et tous les trois doivent republier à
// l'identique. Le laisser dans l'un des trois ferait diverger les deux autres
// au premier correctif.
//
// Il n'importe que `db` : le mettre ailleurs créerait un cycle avec
// `subscriptions.ts`, qui est déjà au centre de plusieurs.
// ==========================================================================

import type { PrismaTransaction } from './types'

/**
 * Remet au catalogue ce que la suspension en avait retiré.
 *
 * **Ne touche qu'aux ressources marquées** `catalogSuspendedAt`. C'est tout
 * l'objet du marqueur : `status = 'archived'` est la même valeur que celle
 * qu'un formateur pose en archivant lui-même une ressource, et republier sans
 * distinction ressusciterait ce qu'il avait volontairement retiré de la vente.
 *
 * À n'appeler que lorsqu'il ne reste **aucune** période due : régler la
 * dernière échéance ne solde pas un arriéré plus ancien, et un catalogue qui
 * reviendrait sur un impayé partiel viderait la sanction de son sens.
 */
export async function restoreSuspendedCatalog(
  tx: PrismaTransaction,
  trainerId: string,
): Promise<number> {
  const { count } = await tx.course.updateMany({
    where: { trainerId, catalogSuspendedAt: { not: null } },
    data: { status: 'published', catalogSuspendedAt: null },
  })
  return count
}
