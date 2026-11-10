"use client";

import * as React from "react";
import { Btn } from "@/components/nk/button";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";
import { fmtDate, fmtFcfa, fmtNumber } from "@/lib/format";

type Plan = "DECOUVERTE" | "ESSENTIEL" | "CROISSANCE" | "PREMIUM";

export interface CommunityPlanRow {
  plan: Plan;
  label: string;
  members: string;
  priceFcfa: number;
  participants: string;
  replays: string;
  storage: string;
}

export interface CommunityPlanView {
  communityId: string;
  inForce: boolean;
  gridAt: string;
  plan: Plan;
  effective: Plan | null;
  billedNext: Plan;
  billedNextFcfa: number;
  maxPlan: Plan | null;
  unpaid: boolean;
  members: number;
  grid: CommunityPlanRow[];
}

/**
 * Modèle économique v1.1 : la grille Community, la place de la communauté
 * dedans, et le plafond que le formateur peut poser pour ne pas changer de
 * plan sans le vouloir.
 */
export function CommunityPlanPanel({ view }: { view: CommunityPlanView }) {
  const [maxPlan, setMaxPlan] = React.useState<Plan | "">(view.maxPlan ?? "");
  const save = useAction(
    async () => {
      await api.post(`/api/trainer/communities/${view.communityId}/plan`, { maxPlan: maxPlan || null });
    },
    { success: "Le plafond est enregistré.", error: "Le plafond n'a pas pu être enregistré." },
  );
  const labelOf = (p: Plan) => view.grid.find((g) => g.plan === p)?.label ?? p;

  return (
    <section
      aria-labelledby="plan-community-titre"
      className="mt-5 rounded-nk-lg border border-line bg-card p-4 shadow-nk-sm sm:p-6"
    >
      <h2 id="plan-community-titre" className="mb-1 text-[16.5px] font-extrabold">
        Plan Community
      </h2>
      {view.inForce ? (
        <p className="mb-4 text-[13.5px] leading-relaxed text-ink-2">
          Votre communauté a <b className="text-ink">{fmtNumber(view.members)} membre{view.members > 1 ? "s" : ""}</b>
          {" "}et ses droits sont ceux du plan <b className="text-ink">{labelOf(view.effective ?? "DECOUVERTE")}</b>.
          {" "}À la prochaine échéance : plan {labelOf(view.billedNext)},{" "}
          <b className="text-ink">{fmtFcfa(view.billedNextFcfa)}</b> par mois.
        </p>
      ) : (
        <p className="mb-4 text-[13.5px] leading-relaxed text-ink-2">
          Jusqu&apos;au {fmtDate(view.gridAt)}, votre communauté ne paie rien : jusqu&apos;à 3 lives par
          semaine de 2 h au plus, replays en audio. À partir de cette date, le plan suit le nombre de
          membres, selon la grille ci-dessous.
        </p>
      )}
      {view.unpaid ? (
        <p className="mb-4 rounded-nk border border-gold/40 bg-gold-tint p-3 text-[13.5px] leading-relaxed">
          Votre dernière échéance est restée impayée : la communauté garde tous ses membres mais a les
          droits du plan Découverte (plus de nouvelle adhésion au-delà de 20 membres, replays en audio).
          Régler l&apos;échéance suivante rétablit le plan.
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-[13.5px]">
          <thead className="text-[12.5px] uppercase tracking-[0.06em] text-ink-2">
            <tr>
              <th className="py-2 pr-3">Plan</th>
              <th className="py-2 pr-3">Membres</th>
              <th className="py-2 pr-3">Prix par mois</th>
              <th className="py-2 pr-3">Participants par live</th>
              <th className="py-2 pr-3">Replays</th>
              <th className="py-2">Stockage</th>
            </tr>
          </thead>
          <tbody>
            {view.grid.map((row) => (
              <tr
                key={row.plan}
                className={`border-t border-line-2 ${view.inForce && row.plan === view.billedNext ? "bg-brand/5 font-bold" : ""}`}
              >
                <td className="py-2 pr-3">{row.label}</td>
                <td className="py-2 pr-3">{row.members}</td>
                <td className="py-2 pr-3">{row.priceFcfa === 0 ? "0 FCFA" : fmtFcfa(row.priceFcfa)}</td>
                <td className="py-2 pr-3">{row.participants}</td>
                <td className="py-2 pr-3">{row.replays}</td>
                <td className="py-2">{row.storage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12.5px] text-ink-2">
        Tous les plans incluent 2 à 3 lives par semaine, de 2 h au plus. Les replays comptent dans le
        stockage du plan.
      </p>

      <div className="mt-5 border-t border-line-2 pt-4">
        <label htmlFor="plafond-plan" className="text-[14px] font-bold">
          Ne pas dépasser le plan
        </label>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
          Les adhésions s&apos;arrêtent quand la communauté atteint la taille de ce plan. Personne
          n&apos;est retiré : un plafond sous la taille actuelle arrête seulement les nouvelles adhésions.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select
            id="plafond-plan"
            value={maxPlan}
            onChange={(e) => setMaxPlan(e.target.value as Plan | "")}
            className="rounded-nk border border-line bg-card px-3 py-2 text-[14px]"
          >
            <option value="">Aucun plafond : le plan suit la taille</option>
            {view.grid.map((row) => (
              <option key={row.plan} value={row.plan}>
                {row.label} ({row.members} membres)
              </option>
            ))}
          </select>
          <Btn size="sm" loading={save.pending} onClick={() => void save.run()}>
            Enregistrer
          </Btn>
        </div>
      </div>
    </section>
  );
}
