import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { EmptyState } from "@/components/nk/empty-state";
import { StPill } from "@/components/nk/status-pill";
import { Btn } from "@/components/nk/button";
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
    <div className="nk-wrap pb-16">
      <PageHead
        title="Mes contestations"
        lead="Le suivi des achats que vous avez contestés, et les échanges avec le support."
        actions={
          <Btn asChild variant="o">
            <Link href="/mes-achats">Retour à mes achats</Link>
          </Btn>
        }
      />

      {total === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<ShieldCheck />}
          title="Aucune contestation"
          description="Si un achat ne correspond pas à ce qui était annoncé, vous pouvez le contester depuis vos achats, dans les 14 jours."
          action={
            <Btn asChild>
              <Link href="/mes-achats">Voir mes achats</Link>
            </Btn>
          }
        />
      ) : (
        <ul className="mt-6 flex flex-col gap-3.5">
          {items.map((dispute) => {
            const state = DISPUTE_STATUS[dispute.status];
            return (
              <li
                key={dispute.id}
                className="flex flex-wrap items-center gap-4 rounded-nk-lg border border-line bg-card px-5 py-4.5 shadow-nk-sm"
              >
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15.5px] font-bold leading-tight">
                    <Link href={`/mes-litiges/${dispute.id}`} className="text-ink hover:text-brand">
                      {dispute.purchase.course?.title ?? "Ressource retirée du catalogue"}
                    </Link>
                  </h2>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-ink-2">
                    <StPill tone={state.tone}>{state.label}</StPill>
                    <span>Ouverte le {fmtDate(dispute.openedAt)}</span>
                    <span>{fmtFcfa(dispute.disputedAmountFcfa)}</span>
                  </p>
                  {dispute.status === "WAITING_LEARNER" && dispute.learnerDeadlineAt ? (
                    <p className="mt-1.5 text-[12.5px] font-semibold text-gold-ink">
                      Réponse attendue avant le {fmtDate(dispute.learnerDeadlineAt)}.
                    </p>
                  ) : null}
                </div>
                <Btn asChild variant="o" size="sm">
                  <Link href={`/mes-litiges/${dispute.id}`}>Ouvrir le dossier</Link>
                </Btn>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
