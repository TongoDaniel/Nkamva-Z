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
export const LEGAL_COMMISSION_LABEL = '15 %'

/** Part formateur telle qu'elle est écrite au même article. */
export const LEGAL_TRAINER_SHARE_LABEL = '85 %'

// --- Conditions d'utilisation, article 4 (remboursement) et 7 (résiliation) ---

/** Délai de contestation écrit à l'article 4. */
export const LEGAL_DISPUTE_WINDOW_DAYS = 14

/** Seuil de consultation écrit à l'article 4. */
export const LEGAL_CONSUMPTION_THRESHOLD_LABEL = '30 %'

/** Délai de réponse à une demande de précision, article 4. */
export const LEGAL_LEARNER_RESPONSE_DAYS = 7

/** Délai avant effacement d'un compte, article 7 — repris par la politique de confidentialité. */
export const LEGAL_DELETION_GRACE_DAYS = 30

// --- Politique de confidentialité, article 4 (durées de conservation) ---------

/** Date de mise à jour de la politique de confidentialité. */
export const LEGAL_PRIVACY_UPDATED_AT = '30 septembre 2026'

/** Conservation des pièces de candidature après la décision. */
export const LEGAL_DOCUMENT_RETENTION_DAYS = 90

/** Validité d'un code à usage unique. */
export const LEGAL_OTP_TTL_MINUTES = 10

/** Conservation de l'adresse d'une personne invitée, après la fin de l'invitation. */
export const LEGAL_INVITATION_RETENTION_DAYS = 90
