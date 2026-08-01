// Libellés des états d'un litige, côté apprenant.
// Module neutre : lisible par un composant serveur comme par un client.

export const DISPUTE_STATUS: Record<
  string,
  { label: string; tone: "ok" | "warn" | "bad" | "info" | "muted"; help: string }
> = {
  OPEN: {
    label: "Ouverte",
    tone: "info",
    help: "Votre contestation est enregistrée. Le support va l'examiner.",
  },
  IN_REVIEW: {
    label: "En cours d'examen",
    tone: "info",
    help: "Le support étudie votre dossier. Vous serez prévenu de la décision.",
  },
  WAITING_LEARNER: {
    label: "Réponse attendue",
    tone: "warn",
    help: "Le support attend un élément de votre part pour avancer.",
  },
  RESOLVED_REFUNDED: {
    label: "Remboursée",
    tone: "ok",
    help: "La contestation a été retenue et le remboursement engagé.",
  },
  RESOLVED_REJECTED: {
    label: "Non retenue",
    tone: "bad",
    help: "La contestation n'a pas été retenue. Votre accès à la ressource est rétabli.",
  },
  RESOLVED_AUTO: {
    label: "Close sans réponse",
    tone: "muted",
    help: "Le dossier a été clos faute de réponse dans le délai. Votre accès est rétabli.",
  },
};

export const DISPUTE_REASONS = [
  { value: "CONTENT_MISMATCH", label: "Le contenu ne correspond pas à la description" },
  { value: "ACCESS_ISSUE", label: "Je n'arrive pas à accéder à la ressource" },
  { value: "DOUBLE_CHARGE", label: "J'ai été prélevé deux fois" },
  { value: "UNAUTHORIZED_CHARGE", label: "Je n'ai pas autorisé ce paiement" },
  { value: "OTHER", label: "Autre motif" },
] as const;

/** Motifs de refus renvoyés par l'API, traduits pour l'apprenant. */
export const INELIGIBILITY: Record<string, string> = {
  WINDOW_EXPIRED:
    "Le délai de 14 jours pour contester cet achat est dépassé. Le support reste joignable si votre situation est particulière.",
  RESOURCE_DOWNLOADED:
    "Cette ressource a été téléchargée : le fichier est chez vous, elle ne peut plus être remboursée.",
  CONSUMPTION_EXCEEDED:
    "Vous avez consulté plus de 30 % de cette ressource. Au-delà de ce seuil, le remboursement n'est plus automatique.",
};
