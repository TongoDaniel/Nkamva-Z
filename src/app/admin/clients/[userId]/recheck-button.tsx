"use client";

import { Btn } from "@/components/nk/button";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";

/** « J'ai payé mais je n'ai pas accès » : redemander son statut au fournisseur. */
export function RecheckButton({ purchaseId }: { purchaseId: string }) {
  const recheck = useAction(
    async () => {
      const { data } = await api.post<{ status: string; credited: boolean }>(
        `/api/admin/customers/purchases/${purchaseId}/recheck`,
      );
      return data;
    },
    {
      success: (r) =>
        r.status === "SUCCEEDED"
          ? "Paiement confirmé par le fournisseur : l'accès est ouvert."
          : r.status === "FAILED"
            ? "Le fournisseur indique un échec : aucun argent n'a été encaissé."
            : "Toujours en attente chez le fournisseur.",
      error: "Le rapprochement a échoué.",
    },
  );
  return (
    <Btn size="sm" variant="o" loading={recheck.pending} onClick={() => void recheck.run()}>
      Relancer la vérification
    </Btn>
  );
}
