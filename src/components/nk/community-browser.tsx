"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { COMMUNITY_GRID, CommunityCard, type CommunityCardData } from "./community-card";
import { SEARCH_DEBOUNCE_MS, SEARCH_MIN_LENGTH } from "@/lib/search-limits";
import { routesOf, type Space } from "@/lib/spaces";
import { cn } from "@/lib/utils";

/** Une page de cartes, telle que le serveur la rend et telle que la route la renvoie. */
export interface CommunityPage {
  items: CommunityCardData[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Parcourir les communautés : une page à la fois, affinée à la frappe.
 * ==========================================================================
 * Deux raisons de passer par le serveur à chaque frappe plutôt que de filtrer
 * une liste déjà peinte :
 *
 *   · **la bannière**. Son URL est signée et expire en cinq minutes. Une liste
 *     préchargée puis filtrée sur place montrerait, passé ce délai, des
 *     vignettes mortes sans un mot. Chaque réponse en rapporte des fraîches.
 *   · **la page suivante**. Elle n'existe pas côté client, par définition.
 *
 * Trois pièges de ce genre d'écran, et ce qui les tient :
 *
 *   · **Les réponses qui se doublent.** Deux requêtes amorties peuvent revenir
 *     dans le désordre et laisser à l'écran les résultats de « mon » après ceux
 *     de « monta ». Un numéro de séquence tranche : seule la dernière partie
 *     écrit. La précédente est en plus annulée, pour ne pas la laisser courir.
 *   · **Le premier écran.** Il vient du serveur (`initial`), avec son terme
 *     (`initialTerm`) : rien n'est demandé au montage. Un composant client est
 *     rendu par le serveur, donc un robot d'indexation voit bien la première
 *     page — `/communautes` est indexable, et une liste qui n'apparaîtrait
 *     qu'après le JavaScript l'aurait vidée.
 *   · **Le plafond de débit.** 300 ms d'amortissement, et un plafond calibré en
 *     conséquence (`COMMUNITY_SEARCH`). Un 429 n'est pas silencieux : il se dit.
 * ==========================================================================
 */
export function CommunityBrowser({
  space,
  initial,
  initialTerm = "",
  excludeMine,
  label = "Rechercher une communauté",
  placeholder = "Un nom, un thème, un mot de la description…",
  empty,
}: {
  /**
   * Espace qui rend les cartes — il décide de leur cible. Sans valeur par
   * défaut, à dessein : une carte de l'espace connecté qui pointerait vers la
   * fiche publique ferait retomber dans la coquille visiteur.
   */
  space: Space;
  /** La première page, rendue par le serveur. */
  initial: CommunityPage;
  /** Le terme que cette première page reflète, lu de l'URL par le serveur. */
  initialTerm?: string;
  /**
   * Retirer des résultats ce que la personne anime ou a déjà rejoint. Demandé
   * par l'écran, parce que lui seul sait si ça a un sens : sur
   * `/mes-communautes` ses communautés sont déjà en haut de page.
   */
  excludeMine?: boolean;
  label?: string;
  placeholder?: string;
  /** Ce qu'on montre quand il n'y a rien à parcourir, hors recherche. */
  empty?: React.ReactNode;
}) {
  const routes = routesOf(space);
  const [term, setTerm] = React.useState(initialTerm);
  const [page, setPage] = React.useState(initial.page);
  const [data, setData] = React.useState<CommunityPage>(initial);
  const [pending, setPending] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  const latest = React.useRef(0);
  /**
   * Ce que l'écran montre déjà. Initialisé à ce que le serveur a rendu, pour
   * qu'aucune requête ne part au montage — elle redemanderait mot pour mot la
   * réponse qu'on vient d'afficher.
   */
  const shown = React.useRef(`${initialTerm}|${initial.page}`);

  const trimmed = term.trim();
  const searching = trimmed.length >= SEARCH_MIN_LENGTH;
  const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));

  // L'URL suit la frappe en `replaceState` : la recherche se recharge et se
  // partage, et le serveur la relit pour rendre la bonne première page. Le
  // numéro de page n'y entre pas — il se perd au rechargement, et c'est
  // assumé : le mettre supposerait que le serveur le lise aussi, or une page 4
  // rendue d'entrée sur un écran qu'on vient d'ouvrir n'a pas de sens.
  React.useEffect(() => {
    const url = new URL(window.location.href);
    if (trimmed) url.searchParams.set("q", trimmed);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
  }, [trimmed]);

  React.useEffect(() => {
    const signature = `${searching ? trimmed : ""}|${page}`;
    if (shown.current === signature) return;

    const seq = ++latest.current;
    const controller = new AbortController();
    setPending(true);
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ page: String(page) });
      if (searching) params.set("search", trimmed);
      if (excludeMine) params.set("exclude", "mine");
      try {
        const res = await fetch(`/api/communities?${params}`, { signal: controller.signal });
        if (seq !== latest.current) return;
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setFailure(
            body?.error?.message ?? "La recherche n'a pas abouti. Réessayez dans un instant.",
          );
          return;
        }
        const body = (await res.json()) as {
          data: CommunityCardData[];
          meta?: { total: number; page: number; pageSize: number };
        };
        if (seq !== latest.current) return;
        setFailure(null);
        const next = {
          items: body.data,
          total: body.meta?.total ?? body.data.length,
          page: body.meta?.page ?? page,
          pageSize: body.meta?.pageSize ?? initial.pageSize,
        };
        setData(next);
        shown.current = signature;
        // Le serveur ramène la **dernière** page quand celle demandée n'existe
        // plus : un filtre qui se resserre pendant qu'on est en page 4 ne doit
        // pas donner un écran blanc. L'état suit ce qu'il a rendu.
        if (next.page !== page) setPage(next.page);
      } catch (err) {
        // Une requête annulée n'est pas un échec : c'est la frappe qui continue.
        if ((err as Error)?.name === "AbortError" || seq !== latest.current) return;
        setFailure("La recherche n'a pas abouti. Réessayez dans un instant.");
      } finally {
        if (seq === latest.current) setPending(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searching, trimmed, page, excludeMine, initial.pageSize]);

  /** L'état de la recherche, dit en une ligne. */
  const status = failure
    ? failure
    : pending
      ? "Recherche…"
      : data.total === 0
        ? searching
          ? `Aucune communauté ne correspond à « ${trimmed} » — essayez un autre mot.`
          : ""
        : `${data.total} communauté${data.total > 1 ? "s" : ""}${searching ? ` pour « ${trimmed} »` : ""}` +
          (lastPage > 1 ? ` · page ${data.page} sur ${lastPage}` : "");

  return (
    <div>
      <div className="relative mt-6">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-ink-3"
          aria-hidden="true"
        />
        <input
          type="search"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            // Un terme qui change repart de la première page : rester en page 4
            // en affinant montre un vide qui n'en est pas un.
            setPage(1);
          }}
          aria-label={label}
          placeholder={placeholder}
          className="w-full rounded-xl border-[1.5px] border-line bg-card py-3 pl-11 pr-11 text-[15px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-3 focus:border-brand focus:ring-[3px] focus:ring-brand/25"
        />
        {pending ? (
          <Loader2
            className="absolute right-3.5 top-1/2 size-[18px] -translate-y-1/2 animate-spin text-ink-3"
            aria-hidden="true"
          />
        ) : null}
      </div>

      {/* Le nœud existe en permanence : posé seulement quand il a du texte, il
          ne serait pas relu par un lecteur d'écran. */}
      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-[13px] text-ink-3">
        {status}
      </p>

      {data.items.length > 0 ? (
        <ul className={cn("mt-4", COMMUNITY_GRID)}>
          {data.items.map((community, index) => (
            <li key={community.id} className="flex">
              <CommunityCard
                community={community}
                href={routes.community(community.slug)}
                className="flex-1"
                eager={index === 0 && data.page === 1}
              />
            </li>
          ))}
        </ul>
      ) : searching || failure ? null : (
        // Rien à parcourir, et aucune recherche en cours : c'est l'écran
        // appelant qui sait quoi dire. Aucune donnée de repli nulle part.
        (empty ?? null)
      )}

      {lastPage > 1 ? (
        <nav
          aria-label="Pages de communautés"
          className="mt-6 flex items-center justify-center gap-2"
        >
          <PageBtn
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={data.page <= 1 || pending}
            label="Page précédente"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Précédent
          </PageBtn>
          <span className="px-2 text-[13.5px] font-semibold text-ink-2">
            {data.page} / {lastPage}
          </span>
          <PageBtn
            onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
            disabled={data.page >= lastPage || pending}
            label="Page suivante"
          >
            Suivant
            <ChevronRight className="size-4" aria-hidden="true" />
          </PageBtn>
        </nav>
      ) : null}
    </div>
  );
}

function PageBtn({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-full border-[1.5px] border-line bg-card px-3.5 py-2 text-[13.5px] font-semibold text-ink-2 transition",
        "hover:border-ink-3 hover:text-ink disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-line disabled:hover:text-ink-2",
      )}
    >
      {children}
    </button>
  );
}
