// ==========================================================================
// La frontière entre l'administration et le reste de la plateforme
// ==========================================================================
//
// Un administrateur n'est qu'un administrateur. Il n'achète pas, n'adhère à
// aucune communauté, n'accepte pas d'invitation et ne candidate pas au statut
// de formateur.
//
// Ce n'est pas une commodité d'interface, c'est une règle de conflit
// d'intérêts : les mêmes personnes instruisent les litiges, valident les
// dossiers KYC et libèrent les retraits. Qui arbitre ne doit pas pouvoir se
// favoriser — ni être soupçonné de l'avoir fait.
//
// La frontière ne se franchit dans AUCUN sens :
//   · on ne promeut pas un compte existant en administrateur — `createAdmin`
//     refuse une adresse déjà connue (`EMAIL_ALREADY_USED`) ;
//   · on ne rétrograde pas un administrateur en apprenant — on désactive son
//     compte, et il s'en crée un personnel s'il veut acheter.
//
// Le formateur, lui, garde TOUS les privilèges de l'apprenant : il achète, il
// adhère aux communautés des autres formateurs, il y prend la parole. La seule
// communauté qui lui reste fermée est la sienne, et pour une raison sans
// rapport — s'y abonner lui ferait payer une commission sur son propre argent
// (cf. `CANNOT_JOIN_OWN_COMMUNITY` dans memberships.ts).
// ==========================================================================

import type { Role } from '@prisma/client'
import { db } from './db'

/**
 * Code d'erreur métier, relayé en 403 par `errorFromException`.
 * Volontairement explicite : un `FORBIDDEN` nu enverrait chercher un bug de
 * permissions là où il n'y a qu'une règle de gouvernance.
 */
export const ADMIN_CANNOT_ACT_AS_LEARNER = 'ADMIN_CANNOT_ACT_AS_LEARNER'

/**
 * Vrai pour tout rôle autorisé à agir en apprenant — donc tout le monde sauf
 * l'administration. `PENDING_TRAINER` en fait partie : une candidature en
 * cours d'instruction ne retire rien.
 */
export function canActAsLearner(role: Role): boolean {
  return role !== 'ADMIN'
}

/**
 * Barrière posée dans les services, et non dans les seules routes.
 *
 * Le middleware ne protège que les pages, et une garde de route ne protège que
 * cette route : un acte économique atteint par un autre chemin — une autre
 * route, un script, un futur point d'entrée — passerait au travers. Le service
 * est le dernier endroit que tout le monde traverse.
 *
 * Coût : une lecture de `role`. C'est le prix d'une règle qui ne dépend pas de
 * la vigilance de celui qui écrira la prochaine route.
 */
export async function assertCanActAsLearner(userId: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })
  if (!user) throw new Error('USER_NOT_FOUND')
  if (!canActAsLearner(user.role)) throw new Error(ADMIN_CANNOT_ACT_AS_LEARNER)
}
