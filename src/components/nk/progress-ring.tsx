import * as React from "react";
import { Check, Download, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Anneau de progression — port de `.pring`.
 * La valeur est aussi rendue en texte : la couleur seule ne porte pas
 * l'information.
 *
 * `percent` accepte `null` : la longueur de la ressource est alors **inconnue**
 * — une vidéo dont la durée n'a pas pu être lue, un PDF dont les pages n'ont
 * pas pu être comptées. On rend « commencé » plutôt qu'un anneau vide à 0 %,
 * qui ferait croire que rien n'a été enregistré (F3.5).
 */
export function ProgressRing({
  percent,
  downloaded,
  className,
}: {
  percent: number | null;
  /** Format téléchargeable déjà récupéré : la progression n'a pas de sens. */
  downloaded?: boolean;
  className?: string;
}) {
  const inconnu = percent === null;
  const value = inconnu ? 0 : Math.max(0, Math.min(100, Math.round(percent)));
  const label = downloaded
    ? "Téléchargé"
    : inconnu
      ? "Commencé, longueur inconnue"
      : `${value} % consulté`;

  return (
    <span
      role="img"
      aria-label={label}
      className={cn("relative grid size-[46px] shrink-0 place-items-center rounded-full", className)}
      style={{
        // Longueur inconnue : un anneau plein et discret, qui dit « on a
        // commencé » sans prétendre savoir de combien.
        background: inconnu
          ? "var(--color-line-2)"
          : `conic-gradient(var(--color-brand) ${value}%, var(--color-line-2) 0)`,
      }}
    >
      <span className="absolute size-9 rounded-full bg-card" aria-hidden="true" />
      <span className="relative z-1 text-brand" aria-hidden="true">
        {downloaded ? (
          <Download className="size-[17px]" />
        ) : inconnu ? (
          <BookOpen className="size-[17px]" />
        ) : value >= 100 ? (
          <Check className="size-[17px]" />
        ) : (
          <span className="text-[13px] font-bold">{value}%</span>
        )}
      </span>
    </span>
  );
}
