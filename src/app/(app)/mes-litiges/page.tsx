import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { EmptyState } from "@/components/nk/empty-state";
import { StPill } from "@/components/nk/status-pill";
import { getAuthContext } from "@/lib/api";
import { listMyDisputes } from "@/lib/disputes";
import { fmtDate, fmtFcfa } from "@/lib/format";
import { DISPUTE_STATUS } from "./dispute-status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mes contestations",
  robots: { index: false },
};

export default async function MesLitigesPage() {
  const auth = await getAuthContext();
  if (!auth) return null;

  const { items, total } = await listMyDisputes(auth.user.id, 1, 20);

  return (
    <div className="nk-wrap pb-10 sm:pb-16">
      <PageHead
        // Comme pour les factures : une contestation naît d'un achat, le fil
        // d'Ariane porte ce lien mieux qu'un bouton « Retour ».
        crumbs={[{ label: "Mes achats", href: "/mes-achats" }, { label: "Mes contestations" }]}
        title="Mes contestations"
        lead="Le suivi des achats que vous avez contestés, et les échanges avec le support."
      />

      {total === 0 ? (
        // Sans action : le retour aux achats est déjà dans le fil d'Ariane, et
        // la description dit d'où part une contestation.
        <EmptyState
          className="mt-6"
          icon={<ShieldCheck />}
          title="Aucune contestation"
          description="Si un achat ne correspond pas à ce qui était annoncé, vous pouvez le contester depuis vos achats, dans les 14 jours."
        />
      ) : (
        <ul className="mt-6 flex flex-col gap-3.5">
          {items.map((dispute) => {
            const state = DISPUTE_STATUS[dispute.status];
            return (
              /*
                La rangée est le lien. Elle portait un bouton « Ouvrir le dossier » qui menait
                **à la même adresse** que le titre : deux cibles pour une
                destination, et surtout 143 px pris à la colonne de texte.
                En `flex-wrap` avec un `flex-1` qui peut se réduire à zéro, le
                navigateur gardait tout sur une ligne et écrasait le texte :
                162 px de large, métadonnées enroulées sur 106 px de haut.
                Le voile `after:inset-0` étend le lien du titre à la rangée, comme
                dans `ResourceCard` (arbitrage 140).
              */
              <li
                key={dispute.id}
                className="group relative flex items-center gap-3 rounded-nk-lg border border-line bg-card px-4 py-4 shadow-nk-sm transition duration-150 hover:border-brand hover:shadow-nk focus-within:border-brand sm:px-5 sm:py-4.5"
              >
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15.5px] font-bold leading-tight">
                    <Link
                      href={`/mes-litiges/${dispute.id}`}
                      className="text-ink after:absolute after:inset-0 after:content-[''] hover:text-brand"
                    >
                      {dispute.purchase.course?.title ?? "Ressource retirée du catalogue"}
                    </Link>
                  </h2>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-ink-2">
                    <StPill tone={state.tone}>{state.label}</StPill>
                    <span>Ouverte le {fmtDate(dispute.openedAt)}</span>
                    <span>{fmtFcfa(dispute.disputedAmountFcfa)}</span>
                  </p>
                  {dispute.status === "WAITING_LEARNER" && dispute.learnerDeadlineAt ? (
                    <p className="mt-1.5 text-[13px] font-semibold text-gold-ink">
                      Réponse attendue avant le {fmtDate(dispute.learnerDeadlineAt)}.
                    </p>
                  ) : null}
                </div>
                <ChevronRight
                  className="size-4 shrink-0 text-ink-3 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand"
                  aria-hidden="true"
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
