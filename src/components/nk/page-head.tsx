import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Le dernier maillon qui porte une adresse, en remontant depuis la fin — donc le
 * parent immédiat de la page courante. C'est lui que le retour mobile vise.
 */
function parentCrumb(crumbs: Crumb[]): Crumb | null {
  for (let i = crumbs.length - 1; i >= 0; i--) {
    if (crumbs[i].href) return crumbs[i];
  }
  return null;
}

/**
 * En-tête de page générique — port de `.pagehead` + `.crumb`.
 *
 * Le fil d'Ariane est en `flex flex-wrap` : sur 375 px il s'enroulait sur deux
 * à trois lignes, au prix du budget vertical de l'arbitrage 113. Sous `md`, il
 * cède donc la place à un **retour vers le parent** (arbitrage 117) ; le fil
 * complet reparaît au-dessus. Les deux lisent la même liste de miettes : il n'y
 * a pas deux vérités sur l'endroit d'où l'on vient.
 */
export function PageHead({
  crumbs,
  title,
  hint,
  lead,
  actions,
  className,
}: {
  crumbs?: Crumb[];
  title: React.ReactNode;
  /**
   * Le ⓘ posé à côté du titre — un `<Hint>` déjà formé, passé par l'appelant.
   *
   * Il arrive tout fait, et n'est pas importé ici, pour deux raisons : le
   * bouton vit **à côté** du `<h1>` et non dedans — un lecteur d'écran qui
   * liste les titres n'annonce pas « Mes factures, bouton » —, et les
   * quelque cent pages qui posent un `PageHead` sans infobulle n'embarquent
   * pas le popover dans leur paquet client.
   */
  hint?: React.ReactNode;
  lead?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("pb-2 pt-5 sm:pt-8", className)}>
      {crumbs?.length && parentCrumb(crumbs) ? (
        <Link
          href={parentCrumb(crumbs)!.href!}
          className="nk-tap relative mb-3 inline-flex items-center gap-1 text-[14px] font-semibold text-ink-2 hover:text-brand md:hidden"
        >
          <ChevronLeft className="size-4 shrink-0" aria-hidden="true" />
          {parentCrumb(crumbs)!.label}
        </Link>
      ) : null}

      {crumbs?.length ? (
        <nav aria-label="Fil d'Ariane" className="mb-3.5 hidden md:block">
          <ol className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-ink-3">
            {crumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-2">
                {i > 0 ? <ChevronRight className="size-3.5 opacity-55" aria-hidden="true" /> : null}
                {c.href ? (
                  // `nk-tap` : le fil d'Ariane est en `flex`, donc ses liens
                  // sont des blocs de 20px de haut — pas des liens au fil du
                  // texte, et l'exemption WCAG 2.5.5 ne les couvre pas.
                  <Link href={c.href} className="nk-tap relative text-ink-2 hover:text-brand">
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
          <div className="mb-2 flex items-center gap-2">
            <h1 className="text-[clamp(28px,3.4vw,40px)] font-extrabold leading-[1.06] text-balance">
              {title}
            </h1>
            {hint}
          </div>
          {lead ? (
            <p className="max-w-[60ch] text-base leading-[1.55] text-ink-2 text-pretty">{lead}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </div>
  );
}
