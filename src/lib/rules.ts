// ==========================================================================
// Règles de la plateforme annoncées à l'écran — délais, seuils, plafonds
// ==========================================================================
// Les écrans recopiaient ces valeurs à la main : « 14 jours » et « 30 % » à dix
// endroits, « 72 h » à cinq, chaque plafond de fichier dans le message d'erreur
// de son formulaire. Elles concordaient, mais rien ne les tenait ensemble — le
// premier changement de règle aurait laissé la moitié des écrans mentir.
//
// Même principe que `commission.ts` : **aucune dépendance**, ni Prisma, ni
// fournisseur, pour que les composants client puissent l'importer. Les modules
// serveur (`disputes.ts`, `payouts.ts`, `courses.ts`…) lisent leurs constantes
// ici et les réexportent : la règle appliquée et la règle affichée sont la même
// ligne de code.
//
// Ce qui est administré en base (tarifs, délai de réponse du support) n'a rien
// à faire ici : cela se lit au rendu.
// ==========================================================================

const MO = 1024 ** 2
const GO = 1024 ** 3

// --- Litiges et remboursements ----------------------------------------------

/**
 * Délai pour demander un remboursement, compté depuis la date d'achat.
 * Modèle v1.1, « Règle de remboursement » : 7 jours (14 jusqu'au modèle v1.1).
 */
export const DISPUTE_OPENING_WINDOW_DAYS = 7
/**
 * Part consultée au-delà de laquelle un format streamé n'est plus remboursable
 * **pour un simple changement d'avis**. Quand la faute n'est pas celle de
 * l'acheteur (accès non reçu, double paiement, contenu non conforme, live
 * annulé), la consultation ne ferme plus le droit au remboursement.
 */
export const CONSUMPTION_THRESHOLD = 0.3
/** Décision motivée de l'administrateur financier, en heures ouvrées. */
export const REFUND_DECISION_BUSINESS_HOURS = 72
/** Remboursement effectif sur le moyen d'origine, en jours ouvrés. */
export const REFUND_EXECUTION_BUSINESS_DAYS = 5
/** Au-delà de ce nombre de remboursements sur la fenêtre, examen manuel. */
export const REFUND_ABUSE_THRESHOLD = 2
export const REFUND_ABUSE_WINDOW_DAYS = 90

/**
 * La règle telle qu'elle s'affiche sur chaque page produit, à l'écran de
 * paiement et sur le reçu (modèle v1.1, « Affichage »).
 */
export const REFUND_RULE_SUMMARY =
  `Remboursement intégral si l'accès n'est pas reçu, en cas de double paiement, de live annulé ` +
  `ou de contenu différent de sa description. Pas de remboursement pour un simple changement d'avis ` +
  `après l'accès au contenu. Demande sous ${DISPUTE_OPENING_WINDOW_DAYS} jours, décision sous ` +
  `${REFUND_DECISION_BUSINESS_HOURS} h ouvrées.`

/** La même règle, en une ligne, pour le pied du reçu PDF. */
export const REFUND_RULE_RECEIPT_LINE =
  `Remboursement : demande sous ${DISPUTE_OPENING_WINDOW_DAYS} jours, intégral si la faute n'est pas la vôtre, ` +
  `jamais pour un changement d'avis après l'accès.`
/** Délai laissé à l'apprenant pour répondre à une demande de précision. */
export const LEARNER_RESPONSE_DEADLINE_DAYS = 7
export const ATTACHMENT_MAX_SIZE_BYTES = 5 * MO

// --- Compte et données personnelles ------------------------------------------

/** Délai de grâce avant effacement d'un compte. */
export const DELETION_GRACE_DAYS = 30
/** Durée de validité d'un code à usage unique envoyé par e-mail. */
export const OTP_TTL_MINUTES = 10
/** Conservation des pièces d'une candidature formateur après la décision. */
export const DOCUMENT_RETENTION_DAYS = 90
/**
 * Arbitrage 80 — l'adresse d'une personne invitée est vidée ce nombre de jours
 * après l'état terminal de l'invitation (acceptée, révoquée ou expirée).
 */
export const INVITATION_RETENTION_DAYS = 90

// --- Retraits ----------------------------------------------------------------

/** Attente imposée à un moyen de versement neuf ou modifié avant tout retrait. */
export const PAYOUT_METHOD_CARENCE_HOURS = 72
export const PAYOUT_MIN_AMOUNT_FCFA = 10_000
export const BUSINESS_DOC_MAX_SIZE_BYTES = 10 * MO

// --- Lives -------------------------------------------------------------------

/**
 * Jusqu'où à l'avance une séance se programme. La campagne du 12 octobre 2026
 * en a programmé une en l'an 9999 (m12). ⚠️ Valeur provisoire, non arbitrée.
 */
export const LIVE_SCHEDULE_HORIZON_DAYS = 365
/**
 * Une séance « commence dans le passé » au-delà de ce délai : il laisse le
 * temps de remplir le formulaire, pas celui de programmer après coup.
 */
export const LIVE_SCHEDULE_PAST_TOLERANCE_MINUTES = 5
/**
 * Une séance jamais lancée cesse d'être « programmée » ce délai après sa fin
 * prévue. Deux séances de septembre l'étaient encore en mars.
 */
export const LIVE_NEVER_STARTED_CLOSE_HOURS = 24

// --- Fichiers déposés --------------------------------------------------------

export const AVATAR_MAX_BYTES = 2 * MO
/** Couverture de ressource et bannière de communauté : une image, un plafond. */
export const COVER_IMAGE_MAX_BYTES = 5 * MO
export const PDF_MAX_BYTES = 10 * MO
/** Vidéo et archive (kit, Notion, tableur) : c'est le quota qui borne vraiment. */
export const LARGE_FILE_MAX_BYTES = 2 * GO

// --- Stockage formateur ------------------------------------------------------

/**
 * Modèle v1.1 : inclus sur le plan « Vous ne payez que quand vous vendez »,
 * avant les Go gagnés avec les ventes (40 Go jusqu'au modèle v1.1).
 */
export const TRAINER_STORAGE_QUOTA_BYTES = 5 * GO
/**
 * Modèle v1.1, HYPOTHÈSE du document : +1 Go par tranche de 50 000 FCFA de
 * ventes cumulées, sur le plan de base.
 */
export const STORAGE_EARNED_BYTES_PER_STEP = 1 * GO
export const STORAGE_EARNED_STEP_FCFA = 50_000
/** Modèle v1.1 : inclus sur le plan Pro. */
export const PRO_STORAGE_QUOTA_BYTES = 100 * GO

/**
 * Stockage inclus d'un formateur, avant paliers achetés. Fonction pure : le
 * portefeuille, le dépôt de fichier et l'écran Paramètres lisent la même règle.
 */
export function includedStorageBytes(input: { plan: 'BASE' | 'PRO'; cumulativeSalesFcfa: number }): number {
  if (input.plan === 'PRO') return PRO_STORAGE_QUOTA_BYTES
  const steps = Math.floor(Math.max(0, input.cumulativeSalesFcfa) / STORAGE_EARNED_STEP_FCFA)
  return TRAINER_STORAGE_QUOTA_BYTES + steps * STORAGE_EARNED_BYTES_PER_STEP
}
/** Arbitrage 69 — au-delà, le stockage s'achète par tranches de cette taille. */
export const STORAGE_TIER_BYTES = 50 * GO

// --- Écriture ----------------------------------------------------------------

/** « 30 % » — espace insécable avant le signe, comme `COMMISSION_LABEL`. */
export const CONSUMPTION_THRESHOLD_LABEL = `${Math.round(CONSUMPTION_THRESHOLD * 100)} %`

/**
 * Plafond lisible : 5_242_880 → « 5 Mo », 2 Go → « 2 Go ». Les plafonds sont des
 * multiples ronds ; `fmtBytes` écrirait « 2.0 Go », juste pour une mesure mais
 * déplacé dans une règle.
 */
export function sizeLimitLabel(bytes: number): string {
  if (bytes >= GO) return `${+(bytes / GO).toFixed(1)} Go`.replace('.', ',')
  return `${+(bytes / MO).toFixed(1)} Mo`.replace('.', ',')
}
