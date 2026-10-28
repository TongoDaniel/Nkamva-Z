"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/nk/button";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";

/**
 * Acceptation d'une invitation offerte.
 *
 * Le seul geste du produit qui ouvre une adhésion sans paiement : le bouton
 * appelle la route, qui appelle `acceptGiftInvitation` — laquelle porte
 * elle-même tout ce que le webhook porterait, consommation du jeton comprise.
 */
export function AcceptGift({ token, communityName }: { token: string; communityName: string }) {
  const router = useRouter();

  const accept = useAction(
    async () => {
      const { data } = await api.post<{ communitySlug: string; giftMonths: number }>(
        `/api/invitations/${encodeURIComponent(token)}`,
      );
      return data;
    },
    {
      success: ({ giftMonths }) =>
        `Bienvenue dans ${communityName} : ${giftMonths} mois offerts, rien ne vous sera prélevé.`,
      error: "L'invitation n'a pas pu être acceptée.",
      // Navigation dans la transition : le bouton reste occupé jusqu'à ce que
      // la communauté soit à l'écran.
      onSuccess: ({ communitySlug }) => router.push(`/mes-communautes/${communitySlug}`),
    },
  );

  return (
    <Btn size="lg" onClick={() => void accept.run()} loading={accept.pending}>
      Accepter l&apos;invitation
    </Btn>
  );
}
