/** Statuts de `Course.status` tels qu'écrits par src/lib/courses.ts. */
export const COURSE_STATUS: Record<
  string,
  { label: string; tone: "ok" | "warn" | "muted" | "bad" | "info" }
> = {
  published: { label: "Publiée", tone: "ok" },
  draft: { label: "Brouillon", tone: "warn" },
  archived: { label: "Archivée", tone: "muted" },
};

/** Catégories proposées à la saisie. Le champ reste libre côté schéma. */
export const SUGGESTED_CATEGORIES = [
  "Développement",
  "Business",
  "Design",
  "Marketing",
] as const;

/** Formats compris par le lecteur et par la règle de consommation du Lot 2. */
export const COURSE_FORMATS = [
  { value: "video", label: "Vidéo (streamée)" },
  { value: "pdf", label: "PDF (téléchargeable)" },
  { value: "kit", label: "Kit (téléchargeable)" },
  { value: "notion", label: "Modèle Notion (téléchargeable)" },
  { value: "tableur", label: "Tableur (téléchargeable)" },
] as const;

export const COURSE_LEVELS = [
  { value: "", label: "Non précisé" },
  { value: "débutant", label: "Débutant" },
  { value: "intermédiaire", label: "Intermédiaire" },
  { value: "avancé", label: "Avancé" },
] as const;

/**
 * Prix plancher d'une ressource vendue à l'unité, tel que le serveur
 * l'applique. Réexporté et non recopié : les deux valeurs ont vécu séparées,
 * un `500` en dur dans `lib/courses.ts` et celle-ci.
 */
export { MIN_COURSE_PRICE_FCFA as MIN_PRICE_FCFA } from "@/lib/course-rules";
