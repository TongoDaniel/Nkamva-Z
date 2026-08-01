// Libellés des états d'un litige, côté administration.

export const DISPUTE_STATUS: Record<
  string,
  { label: string; tone: "ok" | "warn" | "bad" | "info" | "muted" }
> = {
  OPEN: { label: "À prendre en charge", tone: "info" },
  IN_REVIEW: { label: "En examen", tone: "info" },
  WAITING_LEARNER: { label: "Attente apprenant", tone: "warn" },
  RESOLVED_REFUNDED: { label: "Remboursé", tone: "ok" },
  RESOLVED_REJECTED: { label: "Écarté", tone: "muted" },
  RESOLVED_AUTO: { label: "Clos sans réponse", tone: "muted" },
};

export const REFUND_STATUS: Record<
  string,
  { label: string; tone: "ok" | "warn" | "bad" | "info" | "muted" }
> = {
  PENDING: { label: "Remboursement à exécuter", tone: "warn" },
  COMPLETED: { label: "Remboursement effectué", tone: "ok" },
  FAILED: { label: "Remboursement échoué", tone: "bad" },
  NOT_APPLICABLE: { label: "Sans remboursement", tone: "muted" },
};

export const REASON_LABELS: Record<string, string> = {
  CONTENT_MISMATCH: "Contenu non conforme",
  DOUBLE_CHARGE: "Double prélèvement",
  ACCESS_ISSUE: "Problème d'accès",
  UNAUTHORIZED_CHARGE: "Paiement non autorisé",
  OTHER: "Autre motif",
};

export const SOURCE_LABELS: Record<string, string> = {
  LEARNER_REQUEST: "Demande de l'apprenant",
  STRIPE_CHARGEBACK: "Chargeback Stripe",
  CINETPAY_DISPUTE: "Litige CinetPay",
  ADMIN_INITIATED: "Ouvert par un administrateur",
};

export const RESERVATION_STATUS: Record<string, string> = {
  ACTIVE: "Fonds gelés",
  RELEASED: "Fonds rendus",
  DEBITED: "Fonds débités",
  PARTIALLY_DEBITED: "Fonds partiellement débités",
};
