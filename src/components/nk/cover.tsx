import * as React from "react";
import { FileText, PlayCircle, Table2, Package, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Couverture générée d'une ressource — port de `.cover`.
 * La maquette teinte les rayures par famille de catégorie ; le backend expose
 * `category` en texte libre, donc la teinte est dérivée par correspondance
 * connue puis, à défaut, par hachage stable du libellé (jamais aléatoire).
 */

const TONES = {
  dev: { a: "#dcebe3", b: "#e6f1ea" },
  biz: { a: "#f4e4d4", b: "#f8ecdf" },
  dsg: { a: "#e2e9f4", b: "#eaf0f8" },
  mkt: { a: "#f2e8d2", b: "#f7efdd" },
} as const;

export type CoverTone = keyof typeof TONES;

const CATEGORY_TONES: Record<string, CoverTone> = {
  developpement: "dev",
  développement: "dev",
  dev: "dev",
  tech: "dev",
  business: "biz",
  entrepreneuriat: "biz",
  finance: "biz",
  design: "dsg",
  ux: "dsg",
  marketing: "mkt",
  communication: "mkt",
};

export function coverTone(category?: string | null): CoverTone {
  const key = (category ?? "").trim().toLowerCase();
  if (CATEGORY_TONES[key]) return CATEGORY_TONES[key];
  const keys = Object.keys(TONES) as CoverTone[];
  if (!key) return "dev";
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return keys[hash % keys.length];
}

/**
 * Ton de pastille par famille de catégorie — port du couple `.chip` /
 * `.chip-clay|gold|blue` de la maquette. Même dérivation que `coverTone` :
 * correspondance connue, puis hachage stable, jamais d'aléatoire.
 */
const TONE_TO_CHIP = {
  dev: "brand",
  biz: "clay",
  mkt: "gold",
  dsg: "blue",
} as const;

export function categoryTone(category?: string | null) {
  return TONE_TO_CHIP[coverTone(category)];
}

/** Libellés courts des formats gérés par le backend (`Course.format`). */
export const FORMAT_LABELS: Record<string, string> = {
  video: "Vidéo",
  pdf: "PDF",
  kit: "Kit",
  notion: "Modèle Notion",
  tableur: "Tableur",
};

export function formatLabel(format?: string | null): string {
  if (!format) return "Ressource";
  return FORMAT_LABELS[format] ?? format;
}

export function FormatGlyph({ format, className }: { format?: string | null; className?: string }) {
  const props = { className: cn("size-7", className), "aria-hidden": true as const };
  switch (format) {
    case "video":
      return <PlayCircle {...props} />;
    case "pdf":
      return <FileText {...props} />;
    case "tableur":
      return <Table2 {...props} />;
    case "notion":
      return <StickyNote {...props} />;
    case "kit":
      return <Package {...props} />;
    default:
      return <FileText {...props} />;
  }
}

/**
 * L'adresse de la couverture déposée par le formateur. Stable — ni signature,
 * ni expiration —, donc utilisable depuis un composant client et mise en cache
 * par le navigateur. Voir `api/media/courses/[courseId]/cover/route.ts`.
 *
 * `null` quand aucune image n'a été déposée : c'est ce qui laisse la couverture
 * générée à sa place, plutôt qu'une requête qui répondrait 404 à chaque carte.
 */
export function coverImageUrl(course: { id: string; coverS3Key?: string | null }): string | null {
  if (!course.coverS3Key) return null;
  // Empreinte de la clé, que la route ignore : elle ne sert qu'à casser le
  // cache. Chaque dépôt tire une nouvelle clé (`image-<uuid>.<ext>`), donc
  // remplacer sa couverture change l'adresse — sans quoi le formateur aurait
  // continué à voir l'ancienne image le temps que la redirection mise en cache
  // expire, et aurait conclu une seconde fois que rien ne s'était passé.
  const stamp = course.coverS3Key.replace(/[^a-z0-9]/gi, "").slice(-12);
  return `/api/media/courses/${course.id}/cover?v=${stamp}`;
}

export interface CoverProps extends React.HTMLAttributes<HTMLDivElement> {
  category?: string | null;
  format?: string | null;
  /** Badge en haut à gauche (ex. « VIDÉO · 4 H 20 »). */
  typeLabel?: string | null;
  /**
   * Couverture déposée, via `coverImageUrl`. Posée en image de fond et non en
   * `<img>` : un objet manquant du seau laisserait sinon l'icône d'image cassée
   * du navigateur, là où un fond qui ne peint pas laisse simplement reparaître
   * les rayures. La couverture est décorative — le titre la jouxte partout où
   * elle apparaît —, elle n'a donc pas de texte de remplacement à perdre.
   */
  imageUrl?: string | null;
  className?: string;
}

export function Cover({
  category,
  format,
  typeLabel,
  imageUrl,
  className,
  children,
  ...props
}: CoverProps) {
  const tone = TONES[coverTone(category)];
  return (
    <div
      className={cn("relative grid aspect-video place-items-center overflow-hidden", className)}
      style={{
        background: `repeating-linear-gradient(-52deg, ${tone.a} 0 14px, ${tone.b} 14px 28px)`,
      }}
      {...props}
    >
      {imageUrl ? (
        <span
          className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
          style={{ backgroundImage: `url("${encodeURI(imageUrl)}")` }}
          aria-hidden="true"
        />
      ) : (
        <span className="grid size-16 place-items-center rounded-[18px] bg-card/80 text-ink-2 shadow-nk-sm backdrop-blur-[3px] transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3">
          <FormatGlyph format={format} />
        </span>
      )}
      {typeLabel ? (
        <span className="absolute left-3 top-3 rounded-full bg-ink/85 px-2.5 py-1.5 text-[11px] font-bold leading-none tracking-[0.06em] text-paper backdrop-blur-[3px]">
          {typeLabel}
        </span>
      ) : null}
      {children}
    </div>
  );
}
