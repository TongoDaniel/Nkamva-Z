import * as React from "react";
import { cn } from "@/lib/utils";

const TONES = {
  brand: "border border-line bg-card text-brand",
  blue: "border border-line bg-card text-info",
  gold: "border border-line bg-card text-gold-ink",
  clay: "border border-line bg-card text-clay-ink",
} as const;

/**
 * Le ton ne vivait que sur la pastille d'icône : sans `icon`, `tone` ne
 * peignait rien et une rangée de quatre tuiles sortait en quatre cartes
 * blanches identiques — c'est le cas de dix des onze écrans admin. Faute de
 * glyphe, le ton se lit donc sur un filet vertical, qui suit l'arrondi de la
 * carte.
 */
const RAILS = {
  brand: "border-l-brand",
  blue: "border-l-info",
  gold: "border-l-gold",
  clay: "border-l-clay",
} as const;

/** Tuile de chiffre clé — port de `.adm-stat` / `.mr-stat`. */
export function StatTile({
  icon,
  value,
  label,
  tone = "brand",
  suffix,
  className,
}: {
  icon?: React.ReactNode;
  value: React.ReactNode;
  label: React.ReactNode;
  tone?: keyof typeof TONES;
  suffix?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3.5 rounded-nk-lg border border-line bg-card px-5 py-4.5 shadow-nk-sm",
        !icon && ["border-l-4 rounded-l-sm", RAILS[tone]],
        className,
      )}
    >
      {icon ? (
        <span
          className={cn("grid size-9 shrink-0 place-items-center rounded-nk-sm [&_svg]:size-4", TONES[tone])}
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0">
        <b className="block font-display text-[26px] font-extrabold leading-none">
          {value}
          {suffix ? <small className="ml-1 text-[13px] font-bold text-ink-3">{suffix}</small> : null}
        </b>
        <small className="text-[13px] text-ink-2">{label}</small>
      </span>
    </div>
  );
}
