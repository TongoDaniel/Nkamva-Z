import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { EmptyState } from "@/components/nk/empty-state";
import { StPill } from "@/components/nk/status-pill";
import { StatTile } from "@/components/nk/stat-tile";
import { BtnLink } from "@/components/nk/button-link";
import { getAuthContext } from "@/lib/api";
import { listTrainerDisputes, getFrozenTotal } from "@/lib/trainer-disputes";
import { fmtDate, fmtFcfa, fmtNumber } from "@/lib/format";
import { TRAINER_DISPUTE_STATUS, TRAINER_REASON_LABELS } from "./status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Litiges sur mes ressources",
  robots: { index: false },
};

export default async function FormateurLitigesPage() {
  const auth = await getAuthContext();
  if (!auth?.user.trainerId) return null;

  const [{ items, total }, frozen] = await Promise.all([
    listTrainerDisputes(auth.user.trainerId, 1, 20),
    getFrozenTotal(auth.user.trainerId),
  ]);
  const open = items.filter((d) =>
    ["OPEN", "IN_REVIEW", "WAITING_LEARNER"].includes(d.status),
  ).length;

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[{ label: "Espace formateur", href: "/formateur" }, { label: "Litiges" }]}
        title="Litiges sur mes ressources"
        lead="Les achats contestés. Vous pouvez apporter des éléments à l'équipe de modération."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile tone="blue" value={fmtNumber(total)} label="dossiers au total" />
        <StatTile tone="gold" value={fmtNumber(open)} label="en cours d'examen" />
        <StatTile
          tone="clay"
          value={fmtNumber(frozen)}
          suffix="FCFA"
          label="actuellement gelés"
        />
      </div>

      {total === 0 ? (
        <EmptyState
          icon={<ShieldCheck />}
          title="Aucun litige"
          description="Aucun achat de vos ressources n'a été contesté."
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3.5">
            {items.map((dispute) => {
              const state = TRAINER_DISPUTE_STATUS[dispute.status];
              const active = dispute.fundReservations.find((r) => r.status === "ACTIVE");
              return (
                <li
                  key={dispute.id}
                  className="flex flex-wrap items-center gap-4 rounded-nk-lg border border-line bg-card px-5 py-4.5 shadow-nk-sm"
                >
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[15.5px] font-bold leading-tight">
                      <Link href={`/formateur/litiges/${dispute.id}`} className="text-ink hover:text-brand">
                        {dispute.purchase.course?.title ?? "Ressource retirée"}
                      </Link>
                    </h2>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-ink-2">
                      <StPill tone={state.tone}>{state.label}</StPill>
                      <span>{TRAINER_REASON_LABELS[dispute.reason] ?? dispute.reason}</span>
                      <span>Ouvert le {fmtDate(dispute.openedAt)}</span>
                    </p>
                  </div>
                  {active ? (
                    <span className="whitespace-nowrap text-[13px] font-semibold text-clay-ink">
                      {fmtFcfa(active.reservedAmountFcfa)} gelés
                    </span>
                  ) : null}
                  <BtnLink href={`/formateur/litiges/${dispute.id}`} variant="o" size="sm">
                    Voir le dossier
                  </BtnLink>
                </li>
              );
            })}
          </ul>

          <p className="mt-6 rounded-nk-lg border border-line bg-card px-5 py-4 text-[13px] leading-relaxed text-ink-2 shadow-nk-sm">
            Le motif détaillé rédigé par l&apos;acheteur ne vous est pas communiqué, pas plus que
            son identité. Vous voyez la catégorie du motif, la ressource concernée et le montant
            gelé.
          </p>
        </>
      )}
    </div>
  );
}
