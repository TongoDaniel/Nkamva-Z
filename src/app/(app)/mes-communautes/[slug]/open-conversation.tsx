"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { api, ApiError } from "@/lib/client";

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
  const [pending, setPending] = React.useState(false);

  return (
    <Btn
      variant="o"
      size="sm"
      block
      loading={pending}
      onClick={async () => {
        setPending(true);
        try {
          const { data } = await api.post<{ id: string }>("/api/me/conversations", {
            communitySlug: slug,
          });
          router.push(`/messagerie?fil=${data.id}`);
        } catch (err) {
          toast.error(
            err instanceof ApiError ? err.message : "La conversation n'a pas pu être ouverte.",
          );
          setPending(false);
        }
      }}
    >
      <MessageSquare aria-hidden="true" />
      Écrire au formateur
    </Btn>
  );
}
