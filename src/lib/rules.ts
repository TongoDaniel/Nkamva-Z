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

/** Délai pour contester un achat, compté depuis la date d'achat. */
export const DISPUTE_OPENING_WINDOW_DAYS = 14
/** Part consultée au-delà de laquelle un format streamé n'est plus remboursable. */
export const CONSUMPTION_THRESHOLD = 0.3
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

// --- Fichiers déposés --------------------------------------------------------

export const AVATAR_MAX_BYTES = 2 * MO
/** Couverture de ressource et bannière de communauté : une image, un plafond. */
export const COVER_IMAGE_MAX_BYTES = 5 * MO
export const PDF_MAX_BYTES = 10 * MO
/** Vidéo et archive (kit, Notion, tableur) : c'est le quota qui borne vraiment. */
export const LARGE_FILE_MAX_BYTES = 2 * GO

// --- Stockage formateur ------------------------------------------------------

/** Arbitrage 54 — inclus pour chaque formateur. */
export const TRAINER_STORAGE_QUOTA_BYTES = 40 * GO
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
