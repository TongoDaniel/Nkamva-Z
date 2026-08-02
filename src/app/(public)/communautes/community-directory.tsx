"use client";

import * as React from "react";
import { Search, SearchX } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { CommunityCard } from "@/components/nk/community-card";
import { EmptyState } from "@/components/nk/empty-state";
import { PillInput } from "@/components/nk/input";
import { Tabs, type TabItem } from "@/components/nk/tabs";
import type { Community } from "@/features/demo/community-data";

const SORTS = [
  { value: "pop", label: "Les plus populaires" },
  { value: "price_asc", label: "Prix croissant" },
  { value: "price_desc", label: "Prix décroissant" },
] as const;

type Sort = (typeof SORTS)[number]["value"];

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Barre d'outils du listing communautés (`.ctabs` + `.ctoolbar`). Filtrage et
 * tri côté client : la liste vient de `COMMUNITIES`, des données de
 * démonstration entièrement chargées, pas d'une requête paginée.
 */
export function CommunityDirectory({ communities }: { communities: Community[] }) {
  const [category, setCategory] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState<Sort>("pop");
  // Identifiants littéraux plutôt que `useId` : le composant est unique sur la
  // page, et un id généré diverge entre le rendu serveur et l'hydratation.
  const gridId = "communautes-grille";
  const sortId = "communautes-tri";

  const tabs = React.useMemo<TabItem[]>(() => {
    const seen = new Map<string, string>();
    for (const community of communities) {
      if (!seen.has(community.category.id)) seen.set(community.category.id, community.category.label);
    }
    return [
      { value: "all", label: "Toutes" },
      ...[...seen.entries()].map(([value, label]) => ({ value, label })),
    ];
  }, [communities]);

  const needle = fold(search.trim());
  const visible = React.useMemo(() => {
    const list = communities.filter((community) => {
      if (category !== "all" && community.category.id !== category) return false;
      if (!needle) return true;
      return fold(`${community.name} ${community.author.name} ${community.description}`).includes(
        needle,
      );
    });
    return list.sort((a, b) =>
      sort === "price_asc"
        ? a.price - b.price
        : sort === "price_desc"
          ? b.price - a.price
          : b.members - a.members,
    );
  }, [communities, category, needle, sort]);

  return (
    <>
      {tabs.length > 1 ? (
        <Tabs
          items={tabs}
          value={category}
          onValueChange={setCategory}
          variant="chip"
          label="Filtrer les communautés par catégorie"
          panelId={gridId}
          className="mb-5 mt-6"
        />
      ) : null}

      <div className="mb-5 flex flex-wrap items-center gap-3.5">
        <div className="min-w-[220px] max-w-[420px] flex-1">
          <label htmlFor="communautes-recherche" className="sr-only">
            Rechercher une communauté ou un formateur
          </label>
          <PillInput
            id="communautes-recherche"
            type="search"
            icon={<Search />}
            placeholder="Rechercher une communauté, un formateur…"
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <p className="whitespace-nowrap text-sm font-semibold text-ink-2" aria-live="polite">
          <b className="font-extrabold text-ink">{visible.length}</b> communauté
          {visible.length > 1 ? "s" : ""}
        </p>

        <div className="relative">
          <label htmlFor={sortId} className="sr-only">
            Trier les communautés
          </label>
          <select
            id={sortId}
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
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

      {visible.length === 0 ? (
        <EmptyState
          icon={<SearchX />}
          title="Aucune communauté trouvée"
          description="Essayez une autre catégorie ou un autre terme de recherche."
          action={
            <Btn
              variant="o"
              onClick={() => {
                setCategory("all");
                setSearch("");
              }}
            >
              Réinitialiser les filtres
            </Btn>
          }
        />
      ) : (
        <div id={gridId} className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((community) => (
            <CommunityCard key={community.slug} community={community} />
          ))}
        </div>
      )}
    </>
  );
}
