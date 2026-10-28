"use client";

import { AlertTriangle } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { EmptyState } from "@/components/nk/empty-state";

/**
 * Repli d'une frontière d'erreur. Le message technique n'est jamais affiché :
 * il part dans la console, l'utilisateur reçoit une consigne actionnable.
 */
export function ErrorPanel({
  reset,
  title = "Cette page n'a pas pu se charger",
  description = "Le service est momentanément indisponible. Réessayez dans un instant : vos achats et votre progression ne sont pas affectés.",
}: {
  reset: () => void;
  title?: string;
  description?: string;
}) {
  return (
    <div className="nk-wrap py-10 sm:py-16">
      <EmptyState
        icon={<AlertTriangle />}
        title={title}
        description={description}
        action={<Btn onClick={reset}>Réessayer</Btn>}
      />
    </div>
  );
}
