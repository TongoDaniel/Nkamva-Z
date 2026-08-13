import { fmtNumber } from "@/lib/format";
import { PAYOUT_MIN_AMOUNT_FCFA } from "@/lib/payouts";

/**
 * Le libellé de la tuile « retirable », partagé par l'accueil et par l'espace
 * formateur.
 *
 * Il vit ici parce que les deux écrans affichaient deux montants différents
 * sous la même idée : l'un le solde brut sous le libellé « solde disponible »,
 * l'autre le retirable. Deux chiffres pour une même phrase, c'est exactement la
 * divergence qu'une source unique évite.
 *
 * Et le retirable ne se montre pas nu — `getTrainerWallet` le dit déjà :
 * « afficher un montant retirable sans montrer ce qui en a été retiré rendrait
 * l'écart incompréhensible ». Le libellé porte donc l'immobilisé, gelé par un
 * litige ou déjà parti en demande de retrait, dès qu'il y en a.
 */
export function walletTileLabel(wallet: {
  withdrawableFcfa: number;
  reservedFcfa: number;
  pendingPayoutFcfa: number;
}): string {
  const held = wallet.reservedFcfa + wallet.pendingPayoutFcfa;
  if (held > 0) return `retirable · ${fmtNumber(held)} immobilisés`;
  if (wallet.withdrawableFcfa < PAYOUT_MIN_AMOUNT_FCFA) {
    return `retirable · minimum ${fmtNumber(PAYOUT_MIN_AMOUNT_FCFA)}`;
  }
  return "retirable maintenant";
}
