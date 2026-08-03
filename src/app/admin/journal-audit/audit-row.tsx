"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Une entrée du journal. Le `meta` est replié par défaut : c'est du JSON libre,
 * utile quand on instruit un cas précis, illisible quand on parcourt la liste.
 */
export function AuditRow({
  action,
  actorLabel,
  actorRole,
  targetType,
  targetId,
  createdAt,
  meta,
  group,
}: {
  action: string;
  actorLabel: string;
  actorRole: string | null;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
  meta: unknown;
  group: string;
}) {
  const [open, setOpen] = React.useState(false);
  const hasMeta = meta !== null && meta !== undefined && Object.keys(meta as object).length > 0;

  return (
    <li className="border-b border-line-2 py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-[12.5px] font-bold text-ink">
          {action}
        </code>
        <span className="text-[13px] text-ink-2">{actorLabel}</span>
        {actorRole ? (
          <span className="text-[12px] font-bold uppercase tracking-wide text-ink-3">
            {actorRole}
          </span>
        ) : null}
        <span className="ml-auto text-[12.5px] text-ink-3">{createdAt}</span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-3">
        {targetType ? (
          <span>
            {targetType}
            {targetId ? (
              <>
                {" · "}
                {/* Remonter tout ce qui a touché le même objet est la question
                    qu'on se pose vraiment devant un journal. */}
                <Link
                  href={`/admin/journal-audit?groupe=${group}&cible=${targetId}`}
                  className="font-mono text-brand hover:underline"
                >
                  {targetId.slice(0, 8)}
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
