"use client";

import * as React from "react";
import { Chip } from "./chip";
import { fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface PlanOption {
  id: string;
  name: string;
  /** Montant en FCFA, déjà exprimé pour la période affichée. */
  amountFcfa: number;
  period: string;
  description: string;
  badge?: string;
}

/**
 * Choix d'une formule d'abonnement — port de `.planopt`.
 * Rendu comme un vrai groupe de boutons radio : la sélection est atteignable
 * aux flèches du clavier et annoncée, la carte n'étant que l'habillage.
 */
export function PlanOptions({
  name,
  options,
  value,
  onChange,
  legend,
}: {
  name: string;
  options: PlanOption[];
  value: string;
  onChange: (id: string) => void;
  legend: string;
}) {
  return (
    <fieldset className="mb-4">
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <label
            key={option.id}
            className={cn(
              "relative mb-3 block cursor-pointer rounded-[14px] border-[1.5px] px-4.5 py-4 transition-colors",
              selected
                ? "border-brand shadow-[0_0_0_1px_var(--brand)]"
                : "border-line hover:border-ink-3",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={selected}
              onChange={() => onChange(option.id)}
              className="sr-only"
            />
            <span className="flex items-center justify-between gap-2.5">
              <span className="flex items-center gap-2 text-[15.5px] font-extrabold">
                {option.name}
                {option.badge ? <Chip>{option.badge}</Chip> : null}
              </span>
              <span className="font-display text-[19px] font-extrabold">
                {/* Un tarif à 0 est un vrai cas de la grille — la gratuité de
                    lancement. « 0 FCFA /mois » se lirait comme un bug. */}
                {option.amountFcfa === 0 ? (
                  "Gratuit"
                ) : (
                  <>
                    {fmtNumber(option.amountFcfa)} FCFA
                    <small className="text-xs font-semibold text-ink-3">/{option.period}</small>
                  </>
                )}
              </span>
            </span>
            <span className="mt-1 block text-[13px] text-ink-3">{option.description}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
