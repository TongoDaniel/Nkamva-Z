"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { toast } from "@/components/nk/toast";
import { api, ApiError } from "@/lib/client";

export function SettingRow({
  settingKey,
  value,
  description,
}: {
  settingKey: string;
  value: string;
  description: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [pending, setPending] = React.useState(false);

  async function save() {
    if (draft.trim() === value) {
      setEditing(false);
      return;
    }
    setPending(true);
    try {
      await api.patch(`/api/admin/settings/${encodeURIComponent(settingKey)}`, {
        value: draft.trim(),
      });
      toast.success("Réglage mis à jour.");
      setEditing(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "La mise à jour a échoué.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 border-b border-line-2 py-2.5 last:border-b-0">
      <dt className="w-full shrink-0 font-mono text-[12.5px] text-ink-2 sm:w-[280px]">
        {settingKey}
        {description ? <span className="mt-0.5 block text-[11.5px] text-ink-3">{description}</span> : null}
      </dt>
      <dd className="flex min-w-0 flex-1 items-center gap-2">
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
              onClick={save}
              disabled={pending}
              aria-label="Enregistrer"
              className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg border border-line text-brand hover:border-brand"
            >
              <Check className="size-3.5" aria-hidden="true" />
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
      </dd>
    </div>
  );
}
