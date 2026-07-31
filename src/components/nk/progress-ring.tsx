import * as React from "react";
import { Check, Download } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Anneau de progression — port de `.pring`.
 * La valeur est aussi rendue en texte : la couleur seule ne porte pas
 * l'information.
 */
export function ProgressRing({
  percent,
  downloaded,
  className,
}: {
  percent: number;
  /** Format téléchargeable déjà récupéré : la progression n'a pas de sens. */
  downloaded?: boolean;
  className?: string;
}) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  const label = downloaded ? "Téléchargé" : `${value} % consulté`;

  return (
    <span
      role="img"
      aria-label={label}
      className={cn("relative grid size-[46px] shrink-0 place-items-center rounded-full", className)}
      style={{
        background: `conic-gradient(var(--color-brand) ${value}%, var(--color-line-2) 0)`,
      }}
    >
      <span className="absolute size-9 rounded-full bg-card" aria-hidden="true" />
      <span className="relative z-1 text-brand" aria-hidden="true">
        {downloaded ? (
          <Download className="size-[17px]" />
        ) : value >= 100 ? (
          <Check className="size-[17px]" />
        ) : (
          <span className="text-[11px] font-bold">{value}%</span>
        )}
      </span>
    </span>
  );
}
