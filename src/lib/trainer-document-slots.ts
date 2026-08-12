// Description des trois pièces attendues d'un candidat formateur, partagée par
// le parcours connecté (`/candidature`), le parcours visiteur
// (`/devenir-formateur`) et le suivi.
//
// Module neutre : importé par un composant serveur comme par un composant
// client, sans entraîner l'un dans le paquet de l'autre. Il vit dans `lib/` et
// non dans un dossier de route parce que les deux parcours en dépendent — une
// page publique n'a pas à aller lire dans `(app)/`.
//
// Les valeurs reflètent `DOCUMENT_LIMITS` de `trainer-documents.ts`, qui reste
// l'autorité : le serveur refuse ce qui les dépasse. Ce qui est décrit ici sert
// à le dire avant l'envoi plutôt qu'après.

export interface DocumentSlot {
  type: "ID_CARD" | "DIPLOMA" | "VIDEO";
  label: string;
  help: string;
  accept: string;
  maxLabel: string;
  /** Plafond côté serveur, repris pour refuser le fichier sans aller-retour. */
  maxBytes: number;
}

export const DOCUMENT_SLOTS: DocumentSlot[] = [
  {
    type: "ID_CARD",
    label: "Pièce d'identité",
    help: "Carte nationale, passeport ou titre de séjour en cours de validité.",
    accept: "application/pdf,image/png,image/jpeg,image/webp",
    maxLabel: "PDF, PNG, JPEG ou WebP · 10 Mo max.",
    maxBytes: 10_485_760,
  },
  {
    type: "DIPLOMA",
    label: "Diplôme ou attestation",
    help: "Un document qui atteste de votre expertise sur le domaine enseigné.",
    accept: "application/pdf,image/png,image/jpeg,image/webp",
    maxLabel: "PDF, PNG, JPEG ou WebP · 10 Mo max.",
    maxBytes: 10_485_760,
  },
  {
    type: "VIDEO",
    label: "Vidéo de présentation",
    help: "Deux minutes pour vous présenter et expliquer ce que vous voulez enseigner.",
    accept: "video/mp4",
    maxLabel: "MP4 · 2 Go max.",
    maxBytes: 2_147_483_648,
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
