import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Libellé de catégorie — un surtitre, pas une pastille.
 *
 * C'était une pastille à fond teinté (`.chip`). Retirée le 27 octobre 2026 à la
 * demande du propriétaire, après recherche : une catégorie fixe n'a pas d'état
 * à signaler, et les systèmes de référence la rendent en texte simple (Queensland
 * Health, Customer.io) ; le fond coloré y était une forme appliquée partout, pas
 * un rôle. Le ton ne colore plus que le texte. Un **statut**, lui, passe par
 * `StPill` (point + libellé) ; un **filtre actif** par `FilterPill`.
 */
export const chipVariants = cva(
  "inline-flex items-center gap-1.5 text-[13px] font-bold uppercase leading-none tracking-[0.08em]",
  {
    variants: {
      tone: {
        brand: "text-brand",
        clay: "text-clay-ink",
        gold: "text-gold-ink",
        blue: "text-info",
        muted: "text-ink-3",
      },
    },
    defaultVariants: { tone: "brand" },
  },
);

export interface ChipProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof chipVariants> {}

export function Chip({ className, tone, ...props }: ChipProps) {
  return <span className={cn(chipVariants({ tone }), className)} {...props} />;
}

/** Pastille de filtre actif, avec bouton de retrait (`.pill`). */
export function FilterPill({
  label,
  onRemove,
  removeLabel,
}: {
  label: string;
  onRemove: () => void;
  removeLabel?: string;
}) {
  return (
    // Un filtre actif se retire : c'est une puce cerclée, pas un aplat coloré —
    // ce qui la distingue d'un libellé de catégorie au premier regard.
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card py-1.5 pl-3 pr-2 text-[13px] font-semibold text-ink">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel ?? `Retirer le filtre ${label}`}
        className="nk-tap grid size-[18px] cursor-pointer place-items-center rounded-full text-ink-3 hover:bg-paper hover:text-ink"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="size-[11px]" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </span>
  );
}
