"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Une entrée du journal.
 *
 * L'ordre de lecture a changé : le libellé français passe devant, le code brut
 * derrière. Un journal se lit de deux façons — on cherche d'abord *ce qui s'est
 * passé*, on veut ensuite *où le retrouver dans le code*. Afficher le code seul
 * servait la seconde lecture et abandonnait la première.
 *
 * Le `meta` reste replié : c'est du JSON libre, utile quand on instruit un cas
 * précis, illisible quand on parcourt la liste.
 */
export function AuditRow({
  action,
  actionLabel,
  actorLabel,
  actorRole,
  targetLabel,
  targetId,
  targetIdShort,
  createdAt,
  createdAtIso,
  meta,
  group,
}: {
  action: string;
  actionLabel: string;
  actorLabel: string;
  actorRole: string | null;
  targetLabel: string | null;
  targetId: string | null;
  /** Tronqué seulement si l'identifiant est opaque — voir `shortenTargetId`. */
  targetIdShort: string | null;
  createdAt: string;
  createdAtIso: string;
  meta: unknown;
  group: string;
}) {
  const [open, setOpen] = React.useState(false);
  const hasMeta = meta !== null && meta !== undefined && Object.keys(meta as object).length > 0;

  return (
    <li className="border-b border-line-2 py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <b className="text-[14px] font-bold text-ink">{actionLabel}</b>
        <span className="text-[13px] text-ink-2">{actorLabel}</span>
        {actorRole ? (
          <span className="text-[12px] font-bold uppercase tracking-wide text-ink-3">
            {actorRole}
          </span>
        ) : null}
        {/* L'horodatage complet en infobulle : le fuseau et les millisecondes
            comptent quand on rapproche le journal d'une trace externe. */}
        <time
          dateTime={createdAtIso}
          title={createdAtIso}
          className="ml-auto whitespace-nowrap text-[12.5px] tabular-nums text-ink-3"
        >
          {createdAt}
        </time>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-3">
        <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-[11.5px] text-ink-3">
          {action}
        </code>

        {targetLabel ? (
          <span className="min-w-0">
            {targetLabel}
            {targetId && targetIdShort ? (
              <>
                {" · "}
                {/* Remonter tout ce qui a touché le même objet est la question
                    qu'on se pose vraiment devant un journal. */}
                <Link
                  href={`/admin/journal-audit?groupe=${group}&cible=${encodeURIComponent(targetId)}`}
                  title={targetId}
                  className="font-mono text-brand hover:underline"
                >
                  {targetIdShort}
                </Link>
              </>
            ) : null}
          </span>
        ) : null}

        {hasMeta ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex cursor-pointer items-center gap-1 font-bold text-ink-2 hover:text-ink"
          >
            <ChevronDown
              className={cn("size-3.5 transition-transform", open && "rotate-180")}
              aria-hidden="true"
            />
            Détail
          </button>
        ) : null}
      </div>

      {open && hasMeta ? (
        <pre className="mt-2 overflow-x-auto rounded-nk-sm bg-paper p-3 text-[12px] leading-relaxed text-ink-2">
          {JSON.stringify(meta, null, 2)}
        </pre>
      ) : null}
    </li>
  );
}
