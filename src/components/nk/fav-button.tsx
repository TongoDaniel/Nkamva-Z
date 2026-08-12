"use client";

import * as React from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAction } from "@/hooks/use-action";
import { api, ApiError } from "@/lib/client";

/**
 * Cœur « ajouter aux favoris » posé sur une couverture — port de `.fav`.
 *
 * L'état bascule à l'écran avant la réponse du serveur : mettre de côté doit
 * être instantané. En cas d'échec l'état revient et l'utilisateur est prévenu —
 * sans quoi il croirait avoir enregistré ce qui ne l'a pas été.
 *
 * Sans `courseId` ni `communityId`, le cœur reste purement local : c'est le cas
 * des écrans qui servent encore des données de démonstration.
 */
export function FavButton({
  courseTitle,
  courseId,
  communityId,
  defaultPressed = false,
  onToggle,
  className,
}: {
  courseTitle: string;
  courseId?: string;
  communityId?: string;
  defaultPressed?: boolean;
  onToggle?: (pressed: boolean) => void;
  className?: string;
}) {
  const [pressed, setPressed] = React.useState(defaultPressed);

  const target = courseId ? { courseId } : communityId ? { communityId } : null;

  const save = useAction(() => api.post("/api/me/favorites", target), {
    // Le cœur a déjà changé d'état sous le doigt : rien à annoncer, et rien à
    // rafraîchir puisque la liste n'est pas à l'écran.
    success: null,
    error: null,
    refresh: false,
    onError: (err) => {
      // Le cœur n'a bougé que d'un cran : le remettre, c'est l'inverser.
      setPressed((v) => !v);
      onToggle?.(!pressed);
      toast.error(
        err instanceof ApiError && err.status === 401
          ? "Connectez-vous pour mettre cette ressource de côté."
          : "La mise en favori n'a pas été enregistrée. Réessayez.",
      );
    },
  });

  function persist() {
    if (!target) return;
    void save.run();
  }

  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={save.pending}
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
        persist();
      }}
      className={cn(
        "nk-tap absolute right-3 top-3 z-[3] grid size-[38px] cursor-pointer place-items-center rounded-full",
        "bg-card/90 shadow-nk-sm backdrop-blur-[3px] transition duration-150 hover:scale-110",
        "disabled:cursor-progress disabled:opacity-70",
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
