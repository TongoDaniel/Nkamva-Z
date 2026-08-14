"use client";

import * as React from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { toast } from "@/components/nk/toast";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";

export function SettingRow({
  settingKey,
  value,
  description,
  effect,
  min,
  max,
}: {
  settingKey: string;
  value: string;
  description: string | null;
  /** Ce que la valeur commande réellement. Null pour une clé non câblée. */
  effect: string | null;
  min: number | null;
  max: number | null;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  const bounded = min !== null && max !== null;

  const save = useAction(
    (next: string) =>
      api.patch(`/api/admin/settings/${encodeURIComponent(settingKey)}`, { value: next }),
    {
      success: "Réglage mis à jour.",
      error: "La mise à jour a échoué.",
      onSuccess: () => setEditing(false),
    },
  );

  function submit() {
    if (draft.trim() === value) {
      setEditing(false);
      return;
    }
    // La route refuse déjà une valeur hors bornes ; ce contrôle-ci évite
    // seulement l'aller-retour, il ne remplace pas celui du serveur.
    if (bounded) {
      const parsed = Number(draft.trim());
      if (!/^-?\d+$/.test(draft.trim()) || parsed < min || parsed > max) {
        toast.error(`Entier attendu, entre ${min} et ${max}.`);
        return;
      }
    }
    void save.run(draft.trim());
  }

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 border-b border-line-2 py-2.5 last:border-b-0">
      <dt className="w-full shrink-0 font-mono text-[13px] text-ink-2 sm:w-[280px]">
        {settingKey}
        {description ? <span className="mt-0.5 block text-[13px] text-ink-3">{description}</span> : null}
        {bounded ? (
          <span className="mt-0.5 block text-[13px] text-ink-3">
            Entier de {min} à {max}.
          </span>
        ) : null}
      </dt>
      <dd className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                maxLength={500}
                className="min-w-0 flex-1 rounded-lg border-[1.5px] border-line bg-card px-2.5 py-1.5 text-[13.5px] font-bold text-ink outline-none focus:border-brand"
              />
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
                  setDraft(value);
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
              <span className="text-[14px] font-bold text-ink">{value}</span>
              <Btn size="sm" variant="t" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" aria-hidden="true" />
                Modifier
              </Btn>
            </>
          )}
        </div>
        {effect ? (
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-3">{effect}</p>
        ) : (
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-3">
            Aucun écran ne relit cette clé : la modifier change ce qui est stocké, pas ce que
            fait la plateforme.
          </p>
        )}
      </dd>
    </div>
  );
}
