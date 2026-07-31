// Description des trois pièces attendues, partagée par le wizard et le suivi.
// Module neutre : importé par un composant serveur comme par un composant
// client, sans entraîner l'un dans le paquet de l'autre.

export interface DocumentSlot {
  type: "ID_CARD" | "DIPLOMA" | "VIDEO";
  label: string;
  help: string;
  accept: string;
  maxLabel: string;
}

export const DOCUMENT_SLOTS: DocumentSlot[] = [
  {
    type: "ID_CARD",
    label: "Pièce d'identité",
    help: "Carte nationale, passeport ou titre de séjour en cours de validité.",
    accept: "application/pdf,image/png,image/jpeg,image/webp",
    maxLabel: "PDF, PNG, JPEG ou WebP · 10 Mo max.",
  },
  {
    type: "DIPLOMA",
    label: "Diplôme ou attestation",
    help: "Un document qui atteste de votre expertise sur le domaine enseigné.",
    accept: "application/pdf,image/png,image/jpeg,image/webp",
    maxLabel: "PDF, PNG, JPEG ou WebP · 10 Mo max.",
  },
  {
    type: "VIDEO",
    label: "Vidéo de présentation",
    help: "Deux minutes pour vous présenter et expliquer ce que vous voulez enseigner.",
    accept: "video/mp4",
    maxLabel: "MP4 · 2 Go max.",
  },
];

/** Libellés d'état d'une pièce, communs au wizard et au suivi. */
export const DOCUMENT_STATUS: Record<
  string,
  { label: string; tone: "ok" | "warn" | "bad" | "info" | "muted" }
> = {
  AWAITING_UPLOAD: { label: "Envoi à terminer", tone: "warn" },
  PENDING: { label: "Déposée", tone: "info" },
  RESUBMITTED: { label: "Renvoyée", tone: "info" },
  APPROVED: { label: "Validée", tone: "ok" },
  REJECTED: { label: "Refusée", tone: "bad" },
};
