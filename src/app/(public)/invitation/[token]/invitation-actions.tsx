"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/nk/button";
import { toast } from "@/components/nk/toast";
import { api, ApiError } from "@/lib/client";

/**
 * Acceptation d'une invitation offerte.
 *
 * Le seul geste du produit qui ouvre une adhésion sans paiement : le bouton
 * appelle la route, qui appelle `acceptGiftInvitation` — laquelle porte
 * elle-même tout ce que le webhook porterait, consommation du jeton comprise.
 */
export function AcceptGift({ token, communityName }: { token: string; communityName: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function accept() {
    setPending(true);
    try {
      const { data } = await api.post<{ communitySlug: string; giftMonths: number }>(
        `/api/invitations/${encodeURIComponent(token)}`,
      );
      toast.success(
        `Bienvenue dans ${communityName} — ${data.giftMonths} mois offerts, rien ne vous sera prélevé.`,
      );
      router.push(`/mes-communautes/${data.communitySlug}`);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "L'invitation n'a pas pu être acceptée.",
      );
      setPending(false);
    }
  }

  return (
    <Btn size="lg" onClick={accept} disabled={pending}>
      {pending ? "Ouverture de votre accès…" : "Accepter l'invitation"}
    </Btn>
  );
}
