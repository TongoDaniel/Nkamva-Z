"use client";

import { Btn } from "@/components/nk/button";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";

/** Modèle v1.1 : inscrire ou retirer un formateur de la liste des fondateurs. */
export function FounderToggle({ trainerId, founder }: { trainerId: string; founder: boolean }) {
  const toggle = useAction(
    () => api.post(`/api/admin/trainers/${trainerId}/founder`, { founder: !founder }),
    {
      success: founder ? "Retiré des formateurs fondateurs." : "Inscrit parmi les formateurs fondateurs : le Pro lui est ouvert.",
      error: "Le changement a échoué.",
    },
  );
  return (
    <Btn size="sm" variant="o" loading={toggle.pending} onClick={() => void toggle.run()}>
      {founder ? "Retirer des fondateurs" : "Inscrire parmi les fondateurs"}
    </Btn>
  );
}
