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

export interface CoverProps extends React.HTMLAttributes<HTMLDivElement> {
  category?: string | null;
  format?: string | null;
  /** Badge en haut à gauche (ex. « VIDÉO · 4 H 20 »). */
  typeLabel?: string | null;
  className?: string;
}

export function Cover({ category, format, typeLabel, className, children, ...props }: CoverProps) {
  const tone = TONES[coverTone(category)];
  return (
    <div
      className={cn("relative grid aspect-video place-items-center overflow-hidden", className)}
      style={{
        background: `repeating-linear-gradient(-52deg, ${tone.a} 0 14px, ${tone.b} 14px 28px)`,
      }}
      {...props}
    >
      <span className="grid size-16 place-items-center rounded-[18px] bg-card/80 text-ink-2 shadow-nk-sm backdrop-blur-[3px] transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3">
        <FormatGlyph format={format} />
      </span>
      {typeLabel ? (
        <span className="absolute left-3 top-3 rounded-full bg-ink/85 px-2.5 py-1.5 text-[11px] font-bold leading-none tracking-[0.06em] text-paper backdrop-blur-[3px]">
          {typeLabel}
        </span>
      ) : null}
      {children}
    </div>
  );
}
