// Libellés des états d'un litige, tels que le formateur les voit.
// Formulés de son point de vue : ce qui l'intéresse est le sort de ses fonds.

export const TRAINER_DISPUTE_STATUS: Record<
  string,
  { label: string; tone: "ok" | "warn" | "bad" | "info" | "muted"; help: string }
> = {
  OPEN: {
    label: "Ouvert",
    tone: "info",
    help: "Le dossier vient d'être ouvert. La part correspondante de votre solde est gelée le temps de l'examen.",
  },
  IN_REVIEW: {
    label: "En examen",
    tone: "info",
    help: "L'équipe de modération instruit le dossier. Vos fonds restent gelés jusqu'à la décision.",
  },
  WAITING_LEARNER: {
    label: "Attente de l'acheteur",
    tone: "warn",
    help: "La modération attend une précision de l'acheteur. Sans réponse de sa part, le dossier se clôt et vos fonds vous reviennent.",
  },
  RESOLVED_REFUNDED: {
    label: "Remboursé",
    tone: "bad",
    help: "La contestation a été retenue. La part correspondante est débitée de votre solde une fois le remboursement effectué.",
  },
  RESOLVED_REJECTED: {
    label: "Écarté",
    tone: "ok",
    help: "La contestation n'a pas été retenue. Les fonds gelés vous ont été rendus.",
  },
  RESOLVED_AUTO: {
    label: "Clos sans réponse",
    tone: "ok",
    help: "Le dossier a été clos faute de réponse de l'acheteur. Les fonds gelés vous ont été rendus.",
  },
};

/** Catégories de motif — le détail rédigé par l'acheteur n'est jamais exposé. */
export const TRAINER_REASON_LABELS: Record<string, string> = {
  CONTENT_MISMATCH: "Contenu non conforme à la description",
  DOUBLE_CHARGE: "Double prélèvement",
  ACCESS_ISSUE: "Problème d'accès",
  UNAUTHORIZED_CHARGE: "Paiement non autorisé",
  OTHER: "Autre motif",
};

export const RESERVATION_LABELS: Record<string, string> = {
  ACTIVE: "Gelés",
  RELEASED: "Rendus",
  DEBITED: "Débités",
  PARTIALLY_DEBITED: "Partiellement débités",
};

export const TICKET_STATUS: Record<string, { label: string; tone: "warn" | "ok" }> = {
  OPEN: { label: "En cours d'examen", tone: "warn" },
  RESOLVED: { label: "Réponse apportée", tone: "ok" },
};
