"use client";

import * as React from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Cœur « ajouter aux favoris » posé sur une couverture — port de `.fav`.
 *
 * Phase 1 : l'état est purement local, aucun favori n'est persisté (aucune
 * route `/api/me/favorites` n'existe encore). `onToggle` est le point de
 * branchement : le jour où la route arrive, seul l'appelant change.
 */
export function FavButton({
  courseTitle,
  defaultPressed = false,
  onToggle,
  className,
}: {
  courseTitle: string;
  defaultPressed?: boolean;
  onToggle?: (pressed: boolean) => void;
  className?: string;
}) {
  const [pressed, setPressed] = React.useState(defaultPressed);

  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={
        pressed ? `Retirer « ${courseTitle} » des favoris` : `Ajouter « ${courseTitle} » aux favoris`
      }
      onClick={(event) => {
        // La carte entière est un lien : le cœur ne doit pas déclencher la navigation.
        event.preventDefault();
        event.stopPropagation();
        const next = !pressed;
        setPressed(next);
        onToggle?.(next);
      }}
      className={cn(
        "absolute right-3 top-3 z-[3] grid size-[38px] cursor-pointer place-items-center rounded-full",
        "bg-card/90 shadow-nk-sm backdrop-blur-[3px] transition duration-150 hover:scale-110",
        pressed ? "text-danger" : "text-ink-2 hover:text-danger",
        className,
      )}
    >
      <Heart
        className={cn("size-[18px]", pressed && "fill-current animate-[var(--animate-nk-pop)]")}
        aria-hidden="true"
      />
    </button>
  );
}
