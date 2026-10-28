"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import { Plus, Search, SearchX } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { BtnLink } from "@/components/nk/button-link";
import { PillInput } from "@/components/nk/input";
import { EmptyState } from "@/components/nk/empty-state";
import { HELP_ICONS, HelpAnswer } from "@/components/nk/help-answer";
import { answerPlainText } from "@/lib/help-text";
import type { PublicHelpCategory } from "@/lib/help-content";
import { cn } from "@/lib/utils";

/**
 * Le contenu de l'aide vit en base et s'édite depuis /admin/aide
 * (`lib/help-content.ts`). Il arrive ici déjà rendu : marqueurs remplacés par
 * les valeurs en vigueur, liens limités aux pages du site.
 */
const QUICK_TAGS = ["Mobile money", "Remboursement", "Mot de passe", "Devenir formateur"];

/** Insensible à la casse et aux accents : « resilier » doit trouver « résilier ». */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function HelpCenter({
  groups,
  responseHours,
}: {
  groups: PublicHelpCategory[];
  responseHours: number;
}) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState<string | null>(null);
  // Identifiant littéral plutôt que `useId` : voir `components/nk/faq.tsx`.
  const panelId = "aide-reponse";

  const needle = fold(query.trim());
  const filtered = React.useMemo(() => {
    if (!needle) return groups;
    return groups.map((group) => ({
      ...group,
      articles: group.articles.filter((item) =>
        fold(`${item.question} ${answerPlainText(item.answer)}`).includes(needle),
      ),
    })).filter((group) => group.articles.length > 0);
  }, [needle, groups]);

  const total = filtered.reduce((sum, group) => sum + group.articles.length, 0);

  const goToGroup = (id: string) => {
    // Le groupe peut être masqué par une recherche en cours : `flushSync` le
    // remet dans le DOM avant qu'on ne cherche à l'atteindre. Un `rAF` suffirait
    // en apparence, mais il ne s'exécute pas dans un onglet qui ne peint pas.
    flushSync(() => setQuery(""));
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <div className="mx-auto max-w-[720px] pb-2 pt-7 text-center sm:pt-12">
        <h1 className="mb-3 text-[clamp(28px,3.8vw,42px)] font-extrabold leading-[1.06] text-balance">
          Comment pouvons-nous vous aider ?
        </h1>
        <p className="mx-auto max-w-[56ch] text-base leading-[1.55] text-ink-2 text-pretty">
          Trouvez des réponses sur les paiements, les remboursements, les communautés et l&apos;espace
          formateur.
        </p>

        <div className="mt-7">
          <label htmlFor="aide-recherche" className="sr-only">
            Rechercher dans l&apos;aide
          </label>
          <PillInput
            id="aide-recherche"
            type="search"
            icon={<Search />}
            placeholder="Rechercher : paiement mobile money, remboursement, mot de passe…"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="mt-3.5 flex flex-wrap justify-center gap-2">
            {QUICK_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setQuery(tag)}
                className="nk-tap cursor-pointer rounded-full border border-line bg-card px-3.5 py-1.5 text-[13px] font-semibold text-ink-2 transition hover:border-brand hover:text-brand"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      <nav aria-label="Thèmes de l'aide" className="mt-7 sm:mt-10">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {groups.map((group) => {
            const Icon = HELP_ICONS[group.icon];
            return (
            <li key={group.slug}>
              {/* Carte en rangée sur téléphone, en tuile dès `sm`. Empilées en
                  colonne, les cinq tuiles demandaient 145 px chacune — 789 px
                  pour la seule navigation de l'aide, un écran entier avant la
                  première question. L'icône passe à gauche du texte : la
                  hauteur tombe à ce que le texte occupe. */}
              <button
                type="button"
                onClick={() => goToGroup(group.slug)}
                className="flex h-full w-full cursor-pointer items-start gap-3.5 rounded-nk border border-line bg-card p-4 text-left shadow-nk-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-brand-tint-2 hover:shadow-nk sm:block sm:p-5"
              >
                <span
                  className="grid size-11 shrink-0 place-items-center rounded-[14px] border border-line bg-card text-brand [&_svg]:size-[21px] sm:mb-3.5"
                  aria-hidden="true"
                >
                  <Icon />
                </span>
                <span className="min-w-0">
                  <span className="block text-[16px] font-extrabold text-ink">{group.title}</span>
                  <span className="mt-1 block text-[13px] leading-snug text-ink-2">
                    {group.hint}
                  </span>
                </span>
              </button>
            </li>
            );
          })}
        </ul>
      </nav>

      <section aria-labelledby="aide-faq" className="mx-auto mt-9 max-w-[780px] sm:mt-14">
        <h2
          id="aide-faq"
          className="mb-6 text-center text-[clamp(22px,3vw,30px)] font-extrabold"
        >
          Questions fréquentes
        </h2>

        <p className="sr-only" aria-live="polite">
          {needle
            ? `${total} question${total > 1 ? "s" : ""} pour « ${query.trim()} »`
            : `${total} questions au total`}
        </p>

        {total === 0 ? (
          <EmptyState
            icon={<SearchX />}
            title="Aucune réponse ne correspond"
            description={`Essayez un autre mot, ou écrivez-nous : nous répondons sous ${responseHours} heures ouvrées.`}
            action={
              <Btn variant="o" onClick={() => setQuery("")}>
                Effacer la recherche
              </Btn>
            }
          />
        ) : (
          filtered.map((group) => (
            <div key={group.slug} id={group.slug} className="mb-9 scroll-mt-24">
              <p className="mb-3 font-sans text-[13px] font-bold uppercase tracking-[0.1em] text-ink-3">
                {group.title}
              </p>
              {group.articles.map((item) => {
                const key = item.id;
                const isOpen = open === key;
                const itemPanelId = `${panelId}-${item.id}`;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "mb-3 overflow-hidden rounded-nk border bg-card transition-colors duration-200",
                      isOpen ? "border-brand-tint-2" : "border-line",
                    )}
                  >
                    <h3>
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? null : key)}
                        aria-expanded={isOpen}
                        aria-controls={itemPanelId}
                        className="flex w-full cursor-pointer items-center justify-between gap-4 px-[22px] py-[19px] text-left font-sans text-[15.5px] font-bold text-ink hover:text-brand"
                      >
                        {item.question}
                        <span
                          aria-hidden="true"
                          className={cn(
                            "grid size-[30px] flex-none place-items-center rounded-full transition-[transform,background-color] duration-300",
                            isOpen ? "rotate-45 border border-brand bg-card text-brand" : "border border-line bg-card text-ink-2",
                          )}
                        >
                          <Plus className="size-[15px]" />
                        </span>
                      </button>
                    </h3>
                    <div
                      id={itemPanelId}
                      className={cn(
                        "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(.3,.7,.3,1)]",
                        isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                      )}
                    >
                      <div className="overflow-hidden">
                        <p className="px-[22px] pb-5 text-[14.5px] leading-[1.65] text-ink-2">
                          <HelpAnswer segments={item.answer} />
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </section>

      <section className="mx-auto mt-4 max-w-[780px] rounded-nk-lg bg-gradient-to-r from-navy to-navy-2 px-5 py-7 text-center text-white sm:px-8 sm:py-9">
        <h2 className="text-[22px] font-extrabold">Vous n&apos;avez pas trouvé votre réponse ?</h2>
        <p className="mx-auto mt-2 max-w-[52ch] text-[14.5px] leading-relaxed text-[#b9c9dd]">
          Écrivez au support : nous répondons en français sous {responseHours} heures ouvrées.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <BtnLink href="/contact" variant="light">Contacter le support</BtnLink>
          <BtnLink href="/communautes" variant="gh">Demander à la communauté</BtnLink>
        </div>
      </section>
    </>
  );
}
