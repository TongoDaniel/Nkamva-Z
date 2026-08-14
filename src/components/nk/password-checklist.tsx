"use client";

import { Check, Circle } from "lucide-react";
import { PASSWORD_RULES } from "@/lib/validation";
import { cn } from "@/lib/utils";

/**
 * Règles de composition du mot de passe, cochées en direct.
 *
 * Affichée dès l'arrivée sur le champ : la consigne doit être connue *avant*
 * de saisir, pas découverte après un refus. L'état de chaque règle est porté
 * par du texte (`aria-label`) et pas seulement par la couleur ou l'icône.
 */
export function PasswordChecklist({ value, className }: { value: string; className?: string }) {
  return (
    <ul className={cn("mt-2 grid gap-1", className)}>
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(value);
        return (
          <li
            key={rule.id}
            className={cn(
              "flex items-center gap-1.5 text-[13px]",
              ok ? "font-semibold text-brand" : "text-ink-3",
            )}
          >
            {ok ? (
              <Check className="size-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <Circle className="size-3.5 shrink-0" aria-hidden="true" />
            )}
            <span>
              {rule.label}
              <span className="sr-only">{ok ? " — satisfait" : " — pas encore satisfait"}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
