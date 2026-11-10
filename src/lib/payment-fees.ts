// ==========================================================================
// Frais de paiement payés par l'acheteur : modèle économique v1.1
// ==========================================================================
// Principe 3 du modèle : « le client paie le coût réel du paiement, sans
// marge. NKAMVA ne gagne rien sur les frais de paiement et n'en perd rien. »
//
// Le formateur saisit seulement son prix. L'application ajoute les frais réels
// selon le moyen de paiement de l'acheteur, et y inclut le futur retrait du
// formateur, calculé avec son moyen de retrait par défaut (section « Retraits
// des formateurs » : « Frais de retrait : payés par l'acheteur au moment de la
// vente »). Le formateur reçoit donc exactement ce qui est annoncé.
//
// Le calcul part du montant que l'on doit garder après l'encaissement :
//
//     reste = prix + frais du retrait du formateur + part fixe du moyen
//     total = reste / (1 - taux d'encaissement), arrondi au franc supérieur
//
// L'exemple du modèle (produit à 20 000 FCFA, formateur payé sur MTN) en sort
// exactement : MTN ~20 595, Orange ~20 599, carte ~21 506 (voir le test
// `tests/frais-de-paiement.test.ts`). L'arrondi se fait toujours vers le haut :
// un franc de trop par vente vaut mieux qu'un manque structurel.
//
// Volontairement sans dépendance (ni Prisma, ni fournisseur), pour rester
// importable depuis un composant client et depuis l'application mobile.
//
// ⚠️ Les taux ci-dessous sont **publiés** par PawaPay et Stripe France. Nos
// taux réels dépendent du contrat PawaPay (formule « Enterprise ») et du
// prestataire de carte retenu (décision 0.8 du plan d'action) : ils se
// remplacent ici, en un seul endroit.
// ==========================================================================

/** Le moyen de paiement choisi par l'acheteur. */
export type BuyerPaymentMethod =
  | { kind: 'MOBILE_MONEY'; provider: string }
  | { kind: 'CARD' }

/** Le moyen de retrait par défaut du formateur, s'il en a un. */
export type TrainerPayoutTarget =
  | { kind: 'MOBILE_MONEY'; operator: string | null; countryCode?: string | null }
  | { kind: 'BANK' }
  | null

interface CollectionFee {
  rate: number
  fixedFcfa: number
}

/**
 * Encaissement mobile money, par code opérateur PawaPay. Source : PawaPay,
 * frais par pays (modèle v1.1, « Coûts qui montent avec l'usage »).
 */
export const MOBILE_COLLECTION_RATES: Record<string, number> = {
  MTN_MOMO_CMR: 0.0175,
  ORANGE_CMR: 0.0177,
}

/**
 * Repli pour un opérateur dont le taux n'est pas encore relevé.
 * HYPOTHÈSE : le modèle dit « plus de 4 % dans d'autres pays » ; on retient
 * 4,5 % pour ne jamais encaisser moins que ce que coûte le paiement.
 */
export const DEFAULT_MOBILE_COLLECTION_RATE = 0.045

/** Carte : 3,15 % + 0,25 € (164 FCFA au taux fixe), plus 2 % de conversion. */
export const CARD_COLLECTION_RATE = 0.0315 + 0.02
export const CARD_COLLECTION_FIXED_FCFA = 164

/**
 * Versement au formateur, par opérateur de retrait. MTN 1,3 %, Orange 1 %
 * (PawaPay, Cameroun).
 */
export const PAYOUT_RATES: Record<string, number> = {
  MTN_MOMO: 0.013,
  ORANGE_MONEY: 0.01,
}

/**
 * Repli quand le formateur n'a pas encore de moyen de retrait, ou un moyen
 * dont le taux n'est pas relevé : le plus élevé des taux connus, pour que le
 * retrait reste couvert quel que soit l'opérateur qu'il choisira.
 */
export const DEFAULT_PAYOUT_RATE = 0.013

/**
 * Virement bancaire : aucun frais de versement n'est relevé dans le modèle
 * (versements de la diaspora : solution à confirmer par Daniel). HYPOTHÈSE :
 * on applique le repli mobile money, le temps que la solution soit choisie.
 */
export const BANK_PAYOUT_RATE = DEFAULT_PAYOUT_RATE

export function collectionFeeFor(method: BuyerPaymentMethod): CollectionFee {
  if (method.kind === 'CARD') {
    return { rate: CARD_COLLECTION_RATE, fixedFcfa: CARD_COLLECTION_FIXED_FCFA }
  }
  return {
    rate: MOBILE_COLLECTION_RATES[method.provider] ?? DEFAULT_MOBILE_COLLECTION_RATE,
    fixedFcfa: 0,
  }
}

export function payoutRateFor(target: TrainerPayoutTarget): number {
  if (!target) return DEFAULT_PAYOUT_RATE
  if (target.kind === 'BANK') return BANK_PAYOUT_RATE
  return (target.operator && PAYOUT_RATES[target.operator]) || DEFAULT_PAYOUT_RATE
}

export interface BuyerFeeQuote {
  /** Le prix fixé par le formateur. La commission porte sur lui seul. */
  priceFcfa: number
  commissionFcfa: number
  /** Ce que le formateur reçoit, net : « Vous recevrez 18 000 FCFA ». */
  trainerNetFcfa: number
  /** Part des frais qui paie le futur retrait du formateur. */
  payoutFeeFcfa: number
  /** Part des frais qui paie l'encaissement. */
  collectionFeeFcfa: number
  /** Total des frais ajoutés au prix. */
  buyerFeeFcfa: number
  /** Ce que l'acheteur paie : prix + frais. */
  totalFcfa: number
}

/**
 * Les frais d'un achat, pour un prix, une commission et deux moyens donnés.
 *
 * Un prix nul ne porte aucun frais : il n'y a rien à encaisser.
 */
export function quoteBuyerFees(input: {
  priceFcfa: number
  commissionRate: number
  method: BuyerPaymentMethod
  payoutTarget: TrainerPayoutTarget
}): BuyerFeeQuote {
  const priceFcfa = Math.max(0, Math.round(input.priceFcfa))
  const trainerNetFcfa = Math.round(priceFcfa * (1 - input.commissionRate))
  const commissionFcfa = priceFcfa - trainerNetFcfa
  if (priceFcfa === 0) {
    return {
      priceFcfa, commissionFcfa, trainerNetFcfa,
      payoutFeeFcfa: 0, collectionFeeFcfa: 0, buyerFeeFcfa: 0, totalFcfa: 0,
    }
  }

  const payoutFeeFcfa = Math.ceil(trainerNetFcfa * payoutRateFor(input.payoutTarget) - 1e-9)
  const { rate, fixedFcfa } = collectionFeeFor(input.method)
  const kept = priceFcfa + payoutFeeFcfa + fixedFcfa
  const totalFcfa = Math.ceil(kept / (1 - rate) - 1e-9)

  return {
    priceFcfa,
    commissionFcfa,
    trainerNetFcfa,
    payoutFeeFcfa,
    collectionFeeFcfa: totalFcfa - priceFcfa - payoutFeeFcfa,
    buyerFeeFcfa: totalFcfa - priceFcfa,
    totalFcfa,
  }
}

/**
 * La fourchette annoncée sur une page produit, avant que l'acheteur choisisse
 * son moyen : « 20 000 FCFA + frais de paiement (environ 595 FCFA) ». On montre
 * le moyen le moins cher connu, le montant exact venant à l'écran de paiement.
 */
export function cheapestMobileFee(input: {
  priceFcfa: number
  commissionRate: number
  payoutTarget: TrainerPayoutTarget
}): BuyerFeeQuote {
  const quotes = Object.keys(MOBILE_COLLECTION_RATES).map((provider) =>
    quoteBuyerFees({ ...input, method: { kind: 'MOBILE_MONEY', provider } }),
  )
  return quotes.reduce((best, q) => (q.totalFcfa < best.totalFcfa ? q : best))
}
