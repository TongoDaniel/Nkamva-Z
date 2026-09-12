import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { Hint } from "@/components/nk/hint";
import { EmptyState } from "@/components/nk/empty-state";
import { StPill } from "@/components/nk/status-pill";
import { StatStrip } from "@/components/nk/stat-strip";
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
    <div className="nk-wrap pb-10 sm:pb-16">
      <PageHead
        crumbs={[{ label: "Espace formateur", href: "/formateur" }, { label: "Litiges" }]}
        title="Litiges sur mes ressources"
        lead="Les achats contestés. Vous pouvez apporter des éléments à l'équipe de modération."
        hint={
          <Hint label="Ce que vous voyez d'un dossier">
            Le motif détaillé rédigé par l&apos;acheteur ne vous est pas communiqué, pas plus que
            son identité. Vous voyez la catégorie du motif, la ressource concernée et le montant
            gelé.
          </Hint>
        }
      />

      {/* Trois chiffres dans une bande, et non trois cartes : empilées sous
          `sm`, elles prenaient près de 300 px pour afficher trois zéros. */}
      <StatStrip
        className="mb-5 sm:mb-8"
        items={[
          { label: "dossiers au total", value: fmtNumber(total) },
          { label: "en cours d'examen", value: fmtNumber(open) },
          { label: "actuellement gelés", value: fmtNumber(frozen), suffix: "FCFA" },
        ]}
      />

      {total === 0 ? (
        <EmptyState
          icon={<ShieldCheck />}
          title="Aucun litige"
          description="Aucun achat de vos ressources n'a été contesté."
        />
      ) : (
        <ul className="flex flex-col gap-3.5">
          {items.map((dispute) => {
            const state = TRAINER_DISPUTE_STATUS[dispute.status];
            const active = dispute.fundReservations.find((r) => r.status === "ACTIVE");
            return (
              /*
                La rangée est le lien. Elle portait un bouton « Voir le dossier » qui menait
                **à la même adresse** que le titre : deux cibles pour une
                destination, et surtout 135 px pris à la colonne de texte.
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
                      href={`/formateur/litiges/${dispute.id}`}
                      className="text-ink after:absolute after:inset-0 after:content-[''] hover:text-brand"
                    >
                      {dispute.purchase.course?.title ?? "Ressource retirée"}
                    </Link>
                  </h2>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-ink-2">
                    <StPill tone={state.tone}>{state.label}</StPill>
                    <span>{TRAINER_REASON_LABELS[dispute.reason] ?? dispute.reason}</span>
                    <span>Ouvert le {fmtDate(dispute.openedAt)}</span>
                    {/* Le montant gelé rejoint la ligne des métadonnées : en bout
                        de rangée, il disputait encore 90 px à la colonne de texte,
                        alors qu'il se lit comme le reste du dossier. */}
                    {active ? (
                      <span className="font-semibold text-clay-ink">
                        {fmtFcfa(active.reservedAmountFcfa)} gelés
                      </span>
                    ) : null}
                  </p>
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
