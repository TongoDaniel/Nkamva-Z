// ==========================================================================
// Taux de commission de la plateforme — valeur par défaut et libellés
// ==========================================================================
// La vérité d'un achat est `Purchase.commissionRate`, figée à la vente
// (décision 11) ; celle d'un formateur est `TrainerProfile.commissionRate`,
// dont le défaut Prisma vaut ce taux. Ce module ne porte donc que la valeur
// **annoncée** au public et son écriture, pour qu'aucun écran ne recopie
// « 10 % » à la main.
//
// Modèle économique v1.1 (22 octobre 2026) : plan « Vous ne payez que quand
// vous vendez » à 10 %, plan Pro à 3 % (plus 15 000 FCFA par mois). Les frais
// de paiement sont payés par l'acheteur, en plus du prix (`lib/payment-fees`) :
// la commission porte sur le prix fixé par le formateur, jamais sur les frais.
//
// Volontairement sans dépendance — ni Prisma, ni fournisseur de paiement —
// pour rester importable depuis un composant client.
// ==========================================================================

export const PLATFORM_COMMISSION_RATE = 0.1
export const TRAINER_SHARE_RATE = 0.9

/** Modèle v1.1 : commission du plan Pro, en plus de l'abonnement. */
export const PRO_COMMISSION_RATE = 0.03
export const PRO_TRAINER_SHARE_RATE = 0.97

function percent(rate: number) {
  // Espace insécable avant le signe : règle typographique française.
  return `${Math.round(rate * 100)} %`
}

/** « 10 % » : part retenue par NKAMVA sur le plan de base. */
export const COMMISSION_LABEL = percent(PLATFORM_COMMISSION_RATE)
/** « 90 % » : part reversée au formateur sur le plan de base. */
export const TRAINER_SHARE_LABEL = percent(TRAINER_SHARE_RATE)
/** « 3 % » : commission du plan Pro. */
export const PRO_COMMISSION_LABEL = percent(PRO_COMMISSION_RATE)

/** Part du formateur pour un taux de commission donné, arrondie au franc. */
export function trainerShareFor(amountFcfa: number, commissionRate: number): number {
  return Math.round(amountFcfa * (1 - commissionRate))
}
