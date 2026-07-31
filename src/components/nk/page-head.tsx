import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
}

/** En-tête de page générique — port de `.pagehead` + `.crumb`. */
export function PageHead({
  crumbs,
  title,
  lead,
  actions,
  className,
}: {
  crumbs?: Crumb[];
  title: React.ReactNode;
  lead?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("pb-2 pt-8", className)}>
      {crumbs?.length ? (
        <nav aria-label="Fil d'Ariane" className="mb-3.5">
          <ol className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-ink-3">
            {crumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-2">
                {i > 0 ? <ChevronRight className="size-3.5 opacity-55" aria-hidden="true" /> : null}
                {c.href ? (
                  <Link href={c.href} className="text-ink-2 hover:text-brand">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page">{c.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="mb-2 text-[clamp(28px,3.4vw,40px)] font-extrabold leading-[1.06] text-balance">
            {title}
          </h1>
          {lead ? (
            <p className="max-w-[60ch] text-base leading-[1.55] text-ink-2 text-pretty">{lead}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </div>
  );
}
