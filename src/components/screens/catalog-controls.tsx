"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { PillInput, CheckOption } from "@/components/nk/input";
import { FilterPill } from "@/components/nk/chip";
import { formatLabel } from "@/components/nk/cover";
import { cn } from "@/lib/utils";

export interface Facet {
  value: string;
  label: string;
}

const SORTS = [
  { value: "popular", label: "Les plus populaires" },
  { value: "newest", label: "Les plus récentes" },
  { value: "price_asc", label: "Prix croissant" },
  { value: "price_desc", label: "Prix décroissant" },
];

interface CatalogNav {
  push: (patch: Record<string, string | null>) => void;
  pending: boolean;
  search: string;
  category: string;
  format: string;
  sort: string;
}

const CatalogNavContext = React.createContext<CatalogNav | null>(null);

/**
 * L'état du catalogue vit dans l'URL : la liste est rendue côté serveur
 * (indexable, partageable) et ces composants ne font que réécrire la query.
 *
 * La transition est **unique et partagée**. Chaque composant appelait
 * auparavant son propre `useTransition` : changer une case dans la colonne de
 * filtres laissait donc le `pending` de la barre d'outils à faux, et celui des
 * résultats n'existait pas du tout. Le retour n'était pas seulement discret, il
 * se posait ailleurs que là où l'on regardait.
 */
export function CatalogNavProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  const push = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      // Tout changement de filtre ramène à la première page.
      next.delete("page");
      const query = next.toString();
      startTransition(() => router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }));
    },
    [params, pathname, router],
  );

  const value = React.useMemo<CatalogNav>(
    () => ({
      push,
      pending,
      search: params.get("search") ?? "",
      category: params.get("category") ?? "",
      format: params.get("format") ?? "",
      sort: params.get("sort") ?? "newest",
    }),
    [push, pending, params],
  );

  return <CatalogNavContext.Provider value={value}>{children}</CatalogNavContext.Provider>;
}

function useCatalogParams(): CatalogNav {
  const ctx = React.useContext(CatalogNavContext);
  if (!ctx) throw new Error("CatalogNavProvider manquant au-dessus de ce composant.");
  return ctx;
}

function FiltersPanel({
  categories,
  formats,
}: {
  categories: Facet[];
  formats: Facet[];
}) {
  const { push, category, format, search } = useCatalogParams();
  const hasFilters = Boolean(category || format || search);

  return (
    <>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-base font-extrabold">Filtrer</h2>
        {hasFilters ? (
          <button
            type="button"
            onClick={() => push({ category: null, format: null, search: null })}
            className="cursor-pointer py-2 text-[13px] font-semibold text-brand hover:text-brand-dark"
          >
            Réinitialiser
          </button>
        ) : null}
      </div>

      <fieldset className="mb-3 border-b border-line-2 pb-4">
        <legend className="mb-3 mt-1.5 font-sans text-xs font-bold uppercase tracking-[0.1em] text-ink-3">
          Catégorie
        </legend>
        {categories.length ? (
          categories.map((c) => (
            <CheckOption
              key={c.value}
              label={c.label}
              checked={category === c.value}
              onCheckedChange={(next) => push({ category: next ? c.value : null })}
            />
          ))
        ) : (
          <p className="text-[13px] text-ink-3">Aucune catégorie disponible.</p>
        )}
      </fieldset>

      <fieldset className="pb-4">
        <legend className="mb-3 mt-1.5 font-sans text-xs font-bold uppercase tracking-[0.1em] text-ink-3">
          Format
        </legend>
        {formats.length ? (
          formats.map((f) => (
            <CheckOption
              key={f.value}
              label={f.label}
              checked={format === f.value}
              onCheckedChange={(next) => push({ format: next ? f.value : null })}
            />
          ))
        ) : (
          <p className="text-[13px] text-ink-3">Aucun format disponible.</p>
        )}
      </fieldset>
    </>
  );
}

/** Colonne de filtres, visible à partir de 900px. */
export function CatalogFilters(props: { categories: Facet[]; formats: Facet[] }) {
  return (
    <aside
      aria-label="Filtres du catalogue"
      className="sticky top-[88px] hidden flex-col min-[900px]:flex"
    >
      <FiltersPanel {...props} />
    </aside>
  );
}

/** Recherche, tri, filtres actifs, et tiroir de filtres sous 900px. */
export function CatalogToolbar({
  categories,
  formats,
  total,
}: {
  categories: Facet[];
  formats: Facet[];
  total: number;
}) {
  const { push, pending, search, category, format, sort } = useCatalogParams();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [searchDraft, setSearchDraft] = React.useState(search);

  React.useEffect(() => setSearchDraft(search), [search]);

  // Recherche différée : évite une navigation par frappe.
  React.useEffect(() => {
    if (searchDraft.trim() === search) return;
    const id = setTimeout(() => push({ search: searchDraft.trim() || null }), 300);
    return () => clearTimeout(id);
  }, [searchDraft, search, push]);

  React.useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const activeFilters = [
    category ? { key: "category", value: category, label: category } : null,
    format ? { key: "format", value: format, label: formatLabel(format) } : null,
    search ? { key: "search", value: search, label: `« ${search} »` } : null,
  ].filter(Boolean) as Array<{ key: string; value: string; label: string }>;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3.5">
        <Btn
          variant="o"
          size="sm"
          className="min-[900px]:hidden"
          onClick={() => setDrawerOpen(true)}
          aria-expanded={drawerOpen}
          aria-controls="catalog-filters-drawer"
        >
          <SlidersHorizontal aria-hidden="true" />
          Filtres
          {activeFilters.length > 0 ? (
            <span className="rounded-full bg-brand px-1.5 text-[11px] text-white">
              {activeFilters.length}
              <span className="sr-only"> filtres actifs</span>
            </span>
          ) : null}
        </Btn>

        <div className="min-w-[230px] flex-1 max-sm:order-first max-sm:basis-full">
          <label htmlFor="catalog-search" className="sr-only">
            Rechercher une ressource ou un formateur
          </label>
          <PillInput
            id="catalog-search"
            type="search"
            icon={<Search />}
            placeholder="Rechercher une ressource, un formateur…"
            autoComplete="off"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
          />
        </div>

        <p
          className={cn("whitespace-nowrap text-sm font-semibold text-ink-2", pending && "opacity-50")}
          aria-live="polite"
        >
          <b className="font-extrabold text-ink">{total}</b> ressource{total > 1 ? "s" : ""}
        </p>

        <div className="relative">
          <label htmlFor="catalog-sort" className="sr-only">
            Trier les résultats
          </label>
          <select
            id="catalog-sort"
            value={sort}
            onChange={(e) => push({ sort: e.target.value })}
            className="h-12 cursor-pointer appearance-none rounded-full border-[1.5px] border-line bg-card pl-4.5 pr-10 text-sm font-semibold text-ink outline-none hover:border-ink-3 focus-visible:border-brand"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-ink-3"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>

      {activeFilters.length > 0 ? (
        <div className="mb-4.5 flex flex-wrap items-center gap-2">
          {activeFilters.map((f) => (
            <FilterPill
              key={f.key}
              label={f.label}
              onRemove={() => push({ [f.key]: null })}
              removeLabel={`Retirer le filtre ${f.label}`}
            />
          ))}
          <button
            type="button"
            onClick={() => push({ category: null, format: null, search: null })}
            className="cursor-pointer px-1 text-[13px] font-semibold text-brand hover:text-brand-dark"
          >
            Tout effacer
          </button>
        </div>
      ) : null}

      {drawerOpen ? (
        <div
          className="fixed inset-0 z-[135] bg-black/40 min-[900px]:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      ) : null}
      <aside
        id="catalog-filters-drawer"
        aria-label="Filtres du catalogue"
        hidden={!drawerOpen}
        className="fixed inset-y-0 left-0 z-[140] w-[min(320px,86vw)] overflow-y-auto border-r border-line bg-paper px-5 py-5 shadow-nk-lg min-[900px]:hidden"
      >
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Fermer les filtres"
            className="grid size-9 cursor-pointer place-items-center rounded-full border border-line bg-card"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <FiltersPanel categories={categories} formats={formats} />
        <Btn variant="dark" block className="mt-4" onClick={() => setDrawerOpen(false)}>
          Voir les résultats
        </Btn>
      </aside>
    </>
  );
}

/**
 * Enveloppe les résultats pendant qu'une nouvelle requête est en vol.
 *
 * On garde volontairement la liste précédente à l'écran plutôt que de la
 * remplacer par un squelette : on vient de la lire, elle reste utile, et la
 * faire disparaître à chaque case cochée produirait un clignotement. Elle est
 * en revanche marquée périmée — estompée, `aria-busy`, et rendue inerte pour
 * qu'un clic ne parte pas sur une carte qui va être remplacée.
 */
export function CatalogResults({ children }: { children: React.ReactNode }) {
  const { pending } = useCatalogParams();
  return (
    <div
      aria-busy={pending || undefined}
      // Sans transition, à dessein : le filtrage dure environ un quart de
      // seconde, et un fondu de 200 ms n'aurait pas le temps de se dérouler —
      // l'estompage resterait invisible, ce qui était exactement le défaut
      // qu'on corrige. L'état doit tomber d'un coup.
      className={cn(pending && "pointer-events-none opacity-45")}
    >
      {children}
    </div>
  );
}
