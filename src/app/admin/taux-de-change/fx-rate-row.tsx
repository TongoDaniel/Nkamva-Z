"use client";

import * as React from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { StPill } from "@/components/nk/status-pill";
import { toast } from "@/components/nk/toast";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";
import { fmtNumber } from "@/lib/format";

export function FxRateRow({
  currency,
  countries,
  unitsPerXaf,
  sample,
}: {
  currency: string;
  /** Pays desservis par cette devise, en alpha-3 (les codes de PawaPay). */
  countries: string[];
  unitsPerXaf: string | null;
  /** Montant témoin en FCFA, pour rendre le taux lisible à l'œil. */
  sample: number;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(unitsPerXaf ?? "");

  const rate = unitsPerXaf === null ? null : Number(unitsPerXaf);
  const preview = rate !== null && Number.isFinite(rate) ? rate * sample : null;

  const save = useAction(
    (value: number) =>
      api.patch(`/api/admin/fx-rates/${encodeURIComponent(currency)}`, { unitsPerXaf: value }),
    {
      success: `Taux ${currency} enregistré.`,
      error: "L'enregistrement a échoué.",
      // Le champ ne se referme qu'à l'arrivée du taux relu : le refermer plus
      // tôt afficherait l'ancienne valeur comme si elle venait d'être écrite.
      onSuccess: () => setEditing(false),
    },
  );

  function submit() {
    const value = Number(draft.trim().replace(",", "."));
    // La route refuse déjà une valeur hors bornes ; ce contrôle-ci évite
    // seulement l'aller-retour, il ne remplace pas celui du serveur.
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Saisissez un nombre strictement positif.");
      return;
    }
    void save.run(value);
  }

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 border-b border-line-2 py-3 last:border-b-0">
      <dt className="w-full shrink-0 sm:w-[220px]">
        <span className="font-mono text-[13.5px] font-bold text-ink">{currency}</span>
        <span className="mt-0.5 block text-[11.5px] text-ink-3">{countries.join(" · ")}</span>
      </dt>
      <dd className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                inputMode="decimal"
                placeholder="4.3"
                aria-label={`Unités de ${currency} pour 1 FCFA`}
                className="w-[140px] rounded-lg border-[1.5px] border-line bg-card px-2.5 py-1.5 text-[13.5px] font-bold text-ink outline-none focus:border-brand"
              />
              <span className="text-[12px] text-ink-3">{currency} pour 1 FCFA</span>
              <button
                type="button"
                onClick={submit}
                disabled={save.pending}
                aria-busy={save.pending || undefined}
                aria-label="Enregistrer"
                className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg border border-line text-brand hover:border-brand disabled:opacity-50"
              >
                {save.pending ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="size-3.5" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(unitsPerXaf ?? "");
                  setEditing(false);
                }}
                aria-label="Annuler"
                className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg border border-line text-ink-2 hover:border-danger hover:text-danger"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              {rate === null ? (
                <StPill tone="warn">Pays fermé</StPill>
              ) : (
                <span className="text-[14px] font-bold text-ink">
                  {unitsPerXaf} <span className="font-medium text-ink-3">pour 1 FCFA</span>
                </span>
              )}
              <Btn size="sm" variant="t" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" aria-hidden="true" />
                {rate === null ? "Ouvrir" : "Modifier"}
              </Btn>
            </>
          )}
        </div>
        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">
          {preview === null
            ? "Sans taux, aucun achat ne peut aboutir dans cette devise : l'opérateur n'est même pas proposé à l'apprenant."
            : `Une ressource à ${fmtNumber(sample)} FCFA sera débitée ${fmtNumber(Math.round(preview))} ${currency}.`}
        </p>
      </dd>
    </div>
  );
}
