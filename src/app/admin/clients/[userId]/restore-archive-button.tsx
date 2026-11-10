"use client";

import { useRouter } from "next/navigation";
import { Btn } from "@/components/nk/button";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";

/** Plan d'action 2.4 : restauration sur simple demande, par le service client. */
export function RestoreArchiveButton({ trainerId }: { trainerId: string }) {
  const router = useRouter();
  const restore = useAction(
    async () => {
      await api.post(`/api/admin/trainers/${trainerId}/restore-archive`, {});
      router.refresh();
    },
    { success: "Ressources remises en vente.", error: "La restauration a échoué." },
  );
  return (
    <Btn size="sm" variant="o" loading={restore.pending} onClick={() => void restore.run()}>
      Restaurer les ressources archivées
    </Btn>
  );
}
