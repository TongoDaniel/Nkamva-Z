"use client";

import * as React from "react";
import { Btn } from "@/components/nk/button";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";
import { fmtDate, fmtFcfa } from "@/lib/format";

export interface PlanView {
  plan: "BASE" | "PRO";
  pendingPlan: "BASE" | "PRO" | null;
  founder: boolean;
  proAvailable: boolean;
  proOpensAt: string;
  periodEnd: string | null;
  proPriceFcfa: number;
  proDueFcfa: number | null;
  breakEvenFcfa: number;
  /** Ventes du mois en cours, pour la comparaison chiffrée. */
  monthSalesFcfa: number;
}

/**
 * Modèle économique v1.1 : les deux plans Marketplace, côte à côte, avec ce
 * que chacun coûte au formateur pour ses ventes réelles du mois. Le Pro
 * devient intéressant au-delà de ~214 000 FCFA de ventes par mois.
 */
export function PlanPanel({ view }: { view: PlanView }) {
  const change = useAction(
    async (plan: "BASE" | "PRO") => {
      await api.post("/api/trainer/plan", { plan });
    },
    {
      success: "Votre demande est enregistrée.",
      error: "Le changement de plan a échoué.",
    },
  );

  const baseCost = Math.round(view.monthSalesFcfa * 0.1);
  const proCost = view.proPriceFcfa + Math.round(view.monthSalesFcfa * 0.03);
  const isPro = view.plan === "PRO";

  return (
    <section
      aria-labelledby="plan-titre"
      className="mb-5 rounded-nk-lg border border-line bg-card p-4 shadow-nk-sm sm:mb-8 sm:p-6"
    >
      <h2 id="plan-titre" className="mb-1 text-[16.5px] font-extrabold">
        Votre plan
      </h2>
      <p className="mb-5 text-[13.5px] leading-relaxed text-ink-2">
        Les frais de paiement sont toujours payés par l&apos;acheteur, en plus du prix : ils ne
        réduisent jamais ce que vous recevez.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <article
          className={`rounded-nk border p-4 ${!isPro ? "border-brand bg-brand/5" : "border-line"}`}
        >
          <h3 className="text-[15px] font-bold">Vous ne payez que quand vous vendez</h3>
          <p className="mt-1 text-[13.5px] text-ink-2">0 FCFA par mois · 10 % par vente · 5 Go, plus 1 Go par 50 000 FCFA vendus</p>
          <p className="mt-3 text-[13px] text-ink-2">
            Ce mois-ci : <b className="text-ink">{fmtFcfa(baseCost)}</b>
          </p>
          {!isPro ? (
            <p className="mt-3 text-[13px] font-bold text-brand">
              {view.pendingPlan === "PRO" ? "Pro demandé, en attente de règlement" : "Votre plan actuel"}
            </p>
          ) : view.pendingPlan === "BASE" ? (
            <p className="mt-3 text-[13px] text-ink-2">
              Vous y revenez le {view.periodEnd ? fmtDate(view.periodEnd) : "prochain renouvellement"}.
            </p>
          ) : (
            <Btn variant="o" size="sm" className="mt-3" loading={change.pending} onClick={() => void change.run("BASE")}>
              Revenir à ce plan en fin de période
            </Btn>
          )}
        </article>

        <article className={`rounded-nk border p-4 ${isPro ? "border-brand bg-brand/5" : "border-line"}`}>
          <h3 className="text-[15px] font-bold">Pro</h3>
          <p className="mt-1 text-[13.5px] text-ink-2">
            {fmtFcfa(view.proPriceFcfa)} par mois · 3 % par vente · 100 Go
          </p>
          <p className="mt-3 text-[13px] text-ink-2">
            Ce mois-ci : <b className="text-ink">{fmtFcfa(proCost)}</b>
          </p>
          {isPro ? (
            <p className="mt-3 text-[13px] font-bold text-brand">Votre plan actuel</p>
          ) : view.pendingPlan === "PRO" ? (
            <div className="mt-3 text-[13px] text-ink-2">
              Réglez {view.proDueFcfa ? fmtFcfa(view.proDueFcfa) : "l'échéance"} ci-dessous : le Pro et
              ses 3 % s&apos;appliquent dès le règlement.
              <Btn variant="t" size="sm" className="mt-2" loading={change.pending} onClick={() => void change.run("BASE")}>
                Annuler la demande
              </Btn>
            </div>
          ) : view.proAvailable ? (
            <Btn size="sm" className="mt-3" loading={change.pending} onClick={() => void change.run("PRO")}>
              Passer en Pro
            </Btn>
          ) : (
            <p className="mt-3 text-[13px] text-ink-2">Ouvert à tous les formateurs le {fmtDate(view.proOpensAt)}.</p>
          )}
        </article>
      </div>

      <p className="mt-4 text-[12.5px] leading-relaxed text-ink-3">
        Les deux plans coûtent la même chose à environ {fmtFcfa(view.breakEvenFcfa)} de ventes par mois.
        En dessous, le plan de base est moins cher ; au-dessus, le Pro. Vous pouvez revenir au plan de
        base quand vous voulez, sans pénalité.
        {view.founder ? " En tant que formateur fondateur, le Pro vous est ouvert dès le lancement." : ""}
      </p>
    </section>
  );
}
