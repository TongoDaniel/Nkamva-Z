import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Pastille de catégorie — port de `.chip` / `.chip-clay|gold|blue|mut`. */
export const chipVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-bold",
  {
    variants: {
      tone: {
        brand: "bg-brand-tint text-brand",
        clay: "bg-clay-tint text-clay-ink",
        gold: "bg-gold-tint text-gold-ink",
        blue: "bg-info-tint text-info",
        muted: "bg-line-2 text-ink-2",
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
    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint py-1.5 pl-3 pr-2 text-[13px] font-semibold text-brand-dark">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel ?? `Retirer le filtre ${label}`}
        className="grid size-[18px] cursor-pointer place-items-center rounded-full bg-white/60 text-brand-dark hover:bg-white"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="size-[11px]" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </span>
  );
}
