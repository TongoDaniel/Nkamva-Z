// ==========================================================================
// Taux de commission de la plateforme — valeur par défaut et libellés
// ==========================================================================
// La vérité d'un achat est `Purchase.commissionRate`, figée à la vente
// (décision 11) ; celle d'un formateur est `TrainerProfile.commissionRate`,
// dont le défaut Prisma vaut ce taux. Ce module ne porte donc que la valeur
// **annoncée** au public et son écriture, pour qu'aucun écran ne recopie
// « 15 % » à la main.
//
// Volontairement sans dépendance — ni Prisma, ni fournisseur de paiement —
// pour rester importable depuis un composant client.
// ==========================================================================

export const PLATFORM_COMMISSION_RATE = 0.15
export const TRAINER_SHARE_RATE = 0.85

function percent(rate: number) {
  // Espace insécable avant le signe : règle typographique française.
  return `${Math.round(rate * 100)} %`
}

/** « 15 % » — part retenue par NKAMVA. */
export const COMMISSION_LABEL = percent(PLATFORM_COMMISSION_RATE)
/** « 85 % » — part reversée au formateur. */
export const TRAINER_SHARE_LABEL = percent(TRAINER_SHARE_RATE)
