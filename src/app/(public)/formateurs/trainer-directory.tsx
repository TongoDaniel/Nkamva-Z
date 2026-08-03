"use client";

import * as React from "react";
import Link from "next/link";
import { Search, SearchX } from "lucide-react";
import { Avatar } from "@/components/nk/avatar";
import { Btn } from "@/components/nk/button";
import { Chip } from "@/components/nk/chip";
import { EmptyState } from "@/components/nk/empty-state";
import { PillInput } from "@/components/nk/input";
import { Tabs, type TabItem } from "@/components/nk/tabs";
import { fmtNumber } from "@/lib/format";
import type { PublicTrainer } from "@/lib/trainers";

/** Insensible à la casse et aux accents, comme la recherche du catalogue. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Barre d'outils du listing formateurs (`.ctabs` + `.ctoolbar` de la maquette).
 * Le filtrage se fait côté client : `listPublicTrainers` ramène déjà la liste
 * complète (plafonnée à 60), il n'y a pas de pagination à préserver comme au
 * catalogue. Les onglets sont dérivés des domaines réellement présents, pas
 * d'une taxonomie figée qui afficherait des catégories vides.
 */
export function TrainerDirectory({ trainers }: { trainers: PublicTrainer[] }) {
  const [category, setCategory] = React.useState("all");
  const [search, setSearch] = React.useState("");
  // Identifiant littéral plutôt que `useId` : voir `community-directory.tsx`.
  const gridId = "formateurs-grille";

  const tabs = React.useMemo<TabItem[]>(() => {
    const counts = new Map<string, number>();
    for (const trainer of trainers) {
      for (const domain of trainer.domains) {
        counts.set(domain, (counts.get(domain) ?? 0) + 1);
      }
    }
    const domains = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))
      .map(([label]) => ({ value: label, label }));
    return [{ value: "all", label: "Tous" }, ...domains];
  }, [trainers]);

  // Un domaine peut disparaître si la liste change : on ne reste pas coincé
  // sur un onglet qui ne filtre plus rien.
  React.useEffect(() => {
    if (!tabs.some((t) => t.value === category)) setCategory("all");
  }, [tabs, category]);

  const needle = fold(search.trim());
  const visible = React.useMemo(
    () =>
      trainers.filter((trainer) => {
        if (category !== "all" && !trainer.domains.includes(category)) return false;
        if (!needle) return true;
        const haystack = fold(
          [trainer.fullName, trainer.slogan, trainer.description, ...trainer.domains]
            .filter(Boolean)
            .join(" "),
        );
        return haystack.includes(needle);
      }),
    [trainers, category, needle],
  );

  return (
    <>
      {tabs.length > 1 ? (
        <Tabs
          items={tabs}
          value={category}
          onValueChange={setCategory}
          variant="chip"
          label="Filtrer les formateurs par domaine"
          panelId={gridId}
          className="mb-5 mt-6"
        />
      ) : null}

      <div className="mb-5 flex flex-wrap items-center gap-3.5">
        <div className="min-w-[220px] max-w-[420px] flex-1">
          <label htmlFor="formateurs-recherche" className="sr-only">
            Rechercher un formateur ou une expertise
          </label>
          <PillInput
            id="formateurs-recherche"
            type="search"
            icon={<Search />}
            placeholder="Rechercher un formateur, une expertise…"
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <p className="whitespace-nowrap text-sm font-semibold text-ink-2" aria-live="polite">
          <b className="font-extrabold text-ink">{visible.length}</b> formateur
          {visible.length > 1 ? "s" : ""}
        </p>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<SearchX />}
          title="Aucun formateur trouvé"
          description="Essayez un autre domaine ou un autre terme de recherche."
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
        <div id={gridId} className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((trainer) => {
            const name = trainer.fullName ?? "Formateur NkamVa";
            return (
              <article
                key={trainer.id}
                className="flex flex-col rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm"
              >
                <div className="mb-4 flex items-center gap-3.5">
                  <Avatar name={name} size="lg" />
                  <div className="min-w-0">
                    <h2 className="truncate text-[17px] font-extrabold">
                      <Link
                        href={`/formateurs/${trainer.id}`}
                        className="text-ink hover:text-brand"
                      >
                        {name}
                      </Link>
                    </h2>
                    {trainer.slogan ? (
                      <p className="truncate text-[13px] font-semibold text-ink-2">
                        {trainer.slogan}
                      </p>
                    ) : null}
                  </div>
                </div>

                {trainer.domains.length > 0 ? (
                  <ul className="mb-3.5 flex flex-wrap gap-1.5">
                    {trainer.domains.slice(0, 3).map((domain) => (
                      <li key={domain}>
                        <Chip>{domain}</Chip>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {trainer.description ? (
                  <p className="mb-4 line-clamp-3 text-[14px] leading-relaxed text-ink-2">
                    {trainer.description}
                  </p>
                ) : null}

                <dl className="mt-auto flex flex-wrap gap-x-5 gap-y-1 border-t border-line-2 pt-4 text-[12.5px] text-ink-3">
                  <div className="flex gap-1.5">
                    <dd className="font-extrabold text-ink">{trainer.publishedCount}</dd>
                    <dt>ressource{trainer.publishedCount > 1 ? "s" : ""}</dt>
                  </div>
                  {trainer.studentsCount > 0 ? (
                    <div className="flex gap-1.5">
                      <dd className="font-extrabold text-ink">
                        {fmtNumber(trainer.studentsCount)}
                      </dd>
                      <dt>apprenants</dt>
                    </div>
                  ) : null}
                  {trainer.experienceYears ? (
                    <div className="flex gap-1.5">
                      <dd className="font-extrabold text-ink">{trainer.experienceYears}</dd>
                      <dt>ans d&apos;expérience</dt>
                    </div>
                  ) : null}
                </dl>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
