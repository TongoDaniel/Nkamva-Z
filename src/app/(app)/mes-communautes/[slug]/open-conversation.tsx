"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAction } from "@/hooks/use-action";
import { MessageSquare } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { api } from "@/lib/client";

/**
 * Entrée dans la messagerie depuis la communauté — c'est l'adhésion qui ouvre
 * le droit de conversation (arbitrage 33), donc c'est d'ici qu'on y entre.
 *
 * Le fil est créé au clic plutôt qu'à l'adhésion : ouvrir une conversation vide
 * à chaque nouveau membre remplirait la messagerie du formateur de fils que
 * personne n'a voulus.
 */
export function OpenConversation({ slug }: { slug: string }) {
  const router = useRouter();

  const open = useAction(
    async () => {
      const { data } = await api.post<{ id: string }>("/api/me/conversations", {
        communitySlug: slug,
      });
      return data.id;
    },
    {
      success: null,
      error: "La conversation n'a pas pu être ouverte.",
      // On quitte l'écran : rien à rafraîchir ici, et la navigation lancée dans
      // la transition tient le bouton occupé jusqu'à l'arrivée du fil.
      refresh: false,
      onSuccess: (id) => router.push(`/messagerie?fil=${id}`),
    },
  );

  return (
    <Btn
      variant="o"
      size="sm"
      block
      loading={open.pending}
      onClick={() => void open.run()}
    >
      <MessageSquare aria-hidden="true" />
      Écrire au formateur
    </Btn>
  );
}
