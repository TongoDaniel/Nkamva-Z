import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Encart d'information sur fond de marque — port de `.abox`.
 * Sert à porter une règle du produit là où elle s'applique (ce que devient un
 * document, quand l'abonnement est prélevé), pas à décorer.
 */
export function InfoBox({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-4.5 rounded-xl border border-line bg-card border-l-4 border-l-brand px-4 py-3.5 text-[13px] leading-[1.5] text-brand-dark [&_b]:font-extrabold rounded-l-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}
