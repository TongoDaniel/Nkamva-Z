// ==========================================================================
// Les valeurs chiffrées écrites **dans les documents légaux**
// ==========================================================================
// Un contrat énonce ce qui a été accepté à une date donnée : ces nombres ne
// suivent pas la configuration de l'application, ils se modifient à la main, en
// même temps que la date de mise à jour du document et l'information des
// utilisateurs qui l'ont accepté.
//
// Ils vivent quand même ici plutôt qu'au fil du texte, pour une seule raison :
// l'écran Paramètres du Super-admin les compare aux valeurs réellement
// appliquées par l'application (`lib/commission`). C'est le seul endroit d'où
// l'on peut voir qu'une valeur contractuelle a divergé de la valeur en vigueur
// — un écart qui, autrement, ne se découvre qu'en litige.
// ==========================================================================

/** Date de mise à jour affichée en tête des conditions d'utilisation. */
export const LEGAL_TERMS_UPDATED_AT = '1er août 2026'

/** Commission telle qu'elle est écrite à l'article 5 des conditions. */
export const LEGAL_COMMISSION_LABEL = '15 %'

/** Part formateur telle qu'elle est écrite au même article. */
export const LEGAL_TRAINER_SHARE_LABEL = '85 %'
