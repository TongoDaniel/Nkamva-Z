// Libellés des états d'une candidature, partagés par la liste et le détail.

export const APPLICATION_STATUS: Record<
  string,
  { label: string; tone: "ok" | "warn" | "bad" | "info" | "muted" }
> = {
  DRAFT: { label: "Brouillon", tone: "muted" },
  SUBMITTED: { label: "À examiner", tone: "info" },
  RESUBMISSION_PENDING: { label: "Attente du candidat", tone: "warn" },
  APPROVED: { label: "Acceptée", tone: "ok" },
  REJECTED: { label: "Refusée", tone: "bad" },
};

export const DOCUMENT_STATUS: Record<
  string,
  { label: string; tone: "ok" | "warn" | "bad" | "info" | "muted" }
> = {
  AWAITING_UPLOAD: { label: "Envoi non terminé", tone: "warn" },
  PENDING: { label: "À examiner", tone: "info" },
  RESUBMITTED: { label: "Renvoyée", tone: "info" },
  APPROVED: { label: "Validée", tone: "ok" },
  REJECTED: { label: "Refusée", tone: "bad" },
};

export const DOCUMENT_LABELS: Record<string, string> = {
  ID_CARD: "Pièce d'identité",
  DIPLOMA: "Diplôme ou attestation",
  VIDEO: "Vidéo de présentation",
};
