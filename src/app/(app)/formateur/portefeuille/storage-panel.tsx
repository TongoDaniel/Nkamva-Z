"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";
import { fmtBytes, fmtFcfa } from "@/lib/format";

export interface StorageView {
  usedBytes: number;
  quotaBytes: number;
  includedBytes: number;
  tiers: number;
  tierBytes: number;
  tierPriceFcfa: number;
  monthlyTiersFcfa: number;
  minimumTiers: number;
}

/**
 * Achat de paliers de stockage — `/api/trainer/storage` répondait déjà,
 * aucun écran ne l'appelait. Le formateur voyait son quota se remplir sur la
 * fiche d'une ressource, sans jamais pouvoir en acheter davantage.
 */
export function StoragePanel({ storage }: { storage: StorageView }) {
  const [tiers, setTiers] = React.useState(storage.tiers);

  const percent = Math.min(100, Math.round((storage.usedBytes / storage.quotaBytes) * 100) || 0);
  const dirty = tiers !== storage.tiers;
  const monthly = tiers * storage.tierPriceFcfa;

  const save = useAction(() => api.patch("/api/trainer/storage", { tiers }), {
    success:
      tiers > storage.tiers
        ? `Palier ajouté. ${fmtFcfa(monthly)} par ${storage.tierPriceFcfa === monthly ? "mois" : "échéance"} à partir de votre prochain renouvellement.`
        : "Paliers réduits, effectif à votre prochain renouvellement.",
    error: "La mise à jour a échoué.",
    // Le curseur retombe sur la valeur du serveur : le laisser sur un palier
    // qui n'a pas été enregistré ferait croire au contraire.
    onError: () => setTiers(storage.tiers),
  });

  return (
    <section
      aria-labelledby="stockage-titre"
      className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm"
    >
      <h2 id="stockage-titre" className="mb-4 text-[16.5px] font-extrabold">
        Stockage
      </h2>

      <p className="flex items-baseline justify-between text-[13.5px] font-semibold text-ink-2">
        <span>
          {fmtBytes(storage.usedBytes)} sur {fmtBytes(storage.quotaBytes)}
        </span>
        <span>{percent}%</span>
      </p>
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line-2"
        role="img"
        aria-label={`${percent}% du stockage utilisé`}
      >
        <i
          className={`block h-full rounded-full transition-[width] ${percent >= 90 ? "bg-danger" : "bg-brand"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
        {fmtBytes(storage.includedBytes)} inclus dans votre abonnement, puis {fmtBytes(storage.tierBytes)}{" "}
        par palier à {fmtFcfa(storage.tierPriceFcfa)} l&apos;échéance.
      </p>

      <div className="mt-5 flex items-center justify-between gap-4 border-t border-line-2 pt-4">
        <div>
          <p className="text-[13.5px] font-bold text-ink">
            {tiers} palier{tiers > 1 ? "s" : ""}
          </p>
          <p className="text-[12px] text-ink-3">
            {monthly > 0 ? `+ ${fmtFcfa(monthly)} à chaque échéance` : "Aucun palier payant"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTiers((t) => Math.max(storage.minimumTiers, t - 1))}
            disabled={tiers <= storage.minimumTiers}
            aria-label="Retirer un palier"
            className="grid size-9 cursor-pointer place-items-center rounded-lg border border-line text-ink-2 hover:border-ink-3 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Minus className="size-4" aria-hidden="true" />
          </button>
          <span className="w-6 text-center text-[15px] font-bold text-ink">{tiers}</span>
          <button
            type="button"
            onClick={() => setTiers((t) => Math.min(20, t + 1))}
            disabled={tiers >= 20}
            aria-label="Ajouter un palier"
            className="grid size-9 cursor-pointer place-items-center rounded-lg border border-line text-ink-2 hover:border-ink-3 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {storage.minimumTiers > storage.tiers ? (
        <p className="mt-3 text-[12px] leading-relaxed text-danger">
          Ce que vous stockez dépasse déjà votre quota inclus : {storage.minimumTiers} palier
          {storage.minimumTiers > 1 ? "s" : ""} au minimum.
        </p>
      ) : null}

      {dirty ? (
        <Btn size="sm" onClick={() => void save.run()} loading={save.pending} className="mt-4">
          Enregistrer
        </Btn>
      ) : null}

      <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">
        Le changement prend effet à votre prochain renouvellement, comme votre cadence
        d&apos;abonnement : rien n&apos;est facturé aujourd&apos;hui.
      </p>
    </section>
  );
}
