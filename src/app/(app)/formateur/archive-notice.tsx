"use client";

import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";

/**
 * Plan d'action 2.4 : après 6 mois sans connexion ni vente, les ressources
 * sortent du catalogue. La restauration se fait en un clic, ici.
 */
export function ArchiveNotice({ archivedAt }: { archivedAt: string }) {
  const router = useRouter();
  const restore = useAction(
    async () => {
      await api.post("/api/trainer/restore-archive", {});
      router.refresh();
    },
    { success: "Vos ressources sont de nouveau en vente.", error: "La restauration a échoué." },
  );
  return (
    <section className="mb-5 flex flex-wrap items-center gap-3 rounded-nk-lg border border-gold/40 bg-gold-tint p-4">
      <Archive className="size-5 shrink-0 text-gold-ink" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-[14px] leading-relaxed">
        Vos ressources ont été retirées du catalogue le{" "}
        {new Date(archivedAt).toLocaleDateString("fr-FR")}, après 6 mois sans connexion ni vente. Rien n&apos;a été
        supprimé, et ceux qui les ont achetées y ont gardé accès.
      </p>
      <Btn size="sm" loading={restore.pending} onClick={() => void restore.run()}>
        Restaurer mes ressources
      </Btn>
    </section>
  );
}
