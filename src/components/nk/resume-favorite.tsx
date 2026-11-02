"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/client";

/**
 * Reprise du cœur touché avant d'avoir un compte.
 *
 * Le cœur d'un visiteur mène à l'inscription avec, pour destination de reprise
 * (F1.6), la fiche de la ressource et `?favori=1`. Revenu connecté, on fait ce
 * qu'il avait demandé : mettre la ressource de côté.
 *
 * La route des favoris **bascule** : la poster sur une ressource déjà en
 * favori la retirerait. On lit donc la liste d'abord, et on n'ajoute que ce qui
 * manque. Le paramètre est retiré de l'adresse dans tous les cas : recharger la
 * page ne doit rien refaire.
 */
export function ResumeFavorite({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const done = React.useRef(false);

  React.useEffect(() => {
    if (done.current || params.get("favori") !== "1") return;
    done.current = true;
    const next = new URLSearchParams(params.toString());
    next.delete("favori");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });

    void (async () => {
      try {
        const { data } = await api.get<{ courses: { id: string }[] }>("/api/me/favorites");
        if (!data.courses.some((c) => c.id === courseId)) {
          await api.post("/api/me/favorites", { courseId });
        }
        toast.success(`« ${courseTitle} » est dans vos favoris.`);
      } catch {
        toast.error("La mise en favori n'a pas été enregistrée. Réessayez depuis la fiche.");
      }
    })();
  }, [params, pathname, router, courseId, courseTitle]);

  return null;
}
