import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Tableau de données — port de `.adm-table`.
 * La maquette utilise une grille CSS ; on garde un vrai `<table>` pour
 * conserver la sémantique (en-têtes, association cellule/colonne) et on
 * reproduit la mise en page par des largeurs de colonnes.
 */

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  /** Largeur CSS de la colonne (ex. "180px", "1fr" → utiliser "auto"). */
  width?: string;
  align?: "left" | "right" | "center";
  cell: (row: T, index: number) => React.ReactNode;
  /** Masque la colonne sous 720px. */
  hideOnMobile?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  caption,
  empty,
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T, index: number) => string;
  /** Résumé du tableau, visible uniquement des lecteurs d'écran. */
  caption: string;
  empty?: React.ReactNode;
  className?: string;
}) {
  if (rows.length === 0 && empty) {
    return <>{empty}</>;
  }

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[720px] border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={col.width ? { width: col.width } : undefined}
                className={cn(
                  "px-1 pb-2.5 text-[11px] font-extrabold uppercase tracking-[0.06em] text-ink-3",
                  col.align === "right" && "text-right",
                  col.align === "center" && "text-center",
                  col.hideOnMobile && "max-md:hidden",
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={getRowKey(row, index)}
              className="border-b border-line-2 last:border-b-0 hover:bg-paper"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "px-1 py-3.5 align-middle",
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                    col.hideOnMobile && "max-md:hidden",
                  )}
                >
                  {col.cell(row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Cellule « identité » : avatar + nom + sous-titre (`.adm-cell-user`). */
export function CellUser({
  avatar,
  title,
  subtitle,
}: {
  avatar?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {avatar}
      <div className="min-w-0 flex-1">
        <b className="block truncate text-sm font-bold">{title}</b>
        {subtitle ? <small className="block truncate text-[12.3px] text-ink-3">{subtitle}</small> : null}
      </div>
    </div>
  );
}

/** Pagination bas de tableau (`.adm-pager`). */
export function Pager({
  page,
  pageSize,
  total,
  onPageChange,
  label = "Pagination",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  label?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const window = Array.from({ length: pages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === pages || Math.abs(p - page) <= 1,
  );

  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3 pt-4.5">
      <p className="text-[13px] font-semibold text-ink-2" aria-live="polite">
        {from}–{to} sur {total}
      </p>
      <div className="flex gap-1.5">
        {window.map((p, i) => (
          <React.Fragment key={p}>
            {i > 0 && p - window[i - 1] > 1 ? (
              <span className="grid size-[34px] place-items-center text-ink-3" aria-hidden="true">
                …
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => onPageChange(p)}
              aria-current={p === page ? "page" : undefined}
              aria-label={`Page ${p}`}
              className={cn(
                "nk-tap relative size-[34px] cursor-pointer rounded-nk-sm border text-[13px] font-bold",
                p === page
                  ? "border-ink bg-ink text-paper"
                  : "border-line bg-card text-ink-2 hover:border-ink-3",
              )}
            >
              {p}
            </button>
          </React.Fragment>
        ))}
      </div>
    </nav>
  );
}
