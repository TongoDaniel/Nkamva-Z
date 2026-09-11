"use client";

import * as React from "react";
import { Loader2, Search } from "lucide-react";
import { CommunityCard, type CommunityCardData } from "./community-card";
import { SEARCH_DEBOUNCE_MS, SEARCH_MIN_LENGTH } from "@/lib/search-limits";
import { routesOf, type Space } from "@/lib/spaces";

/**
 * Recherche de communautés, à la frappe.
 * ==========================================================================
 * Elle interroge le serveur à chaque frappe amortie, au lieu de filtrer une
 * liste déjà peinte. La raison n'est pas le volume — il est petit — mais la
 * bannière : son URL est **signée et expire en cinq minutes**. Une liste
 * préchargée puis filtrée sur place montrerait, passé ce délai, des vignettes
 * mortes sans aucun message. Chaque réponse en rapporte des fraîches.
 *
 * Trois pièges de ce genre de champ, et ce qui les tient :
 *
 *   · **Les réponses qui se doublent.** Deux requêtes amorties peuvent revenir
 *     dans le désordre et laisser à l'écran les résultats de « mon » après ceux
 *     de « monta ». Un numéro de séquence tranche : seule la dernière partie
 *     écrit. La précédente est en plus annulée, pour ne pas la laisser courir.
 *   · **Le plafond de débit.** 300 ms d'amortissement, et un plafond calibré en
 *     conséquence (`COMMUNITY_SEARCH`). Un 429 n'est pas silencieux : il se dit.
 *   · **La liste initiale.** Elle reste rendue par le serveur et passée en
 *     `children` : un robot d'indexation voit les communautés, et le champ ne
 *     remplace ce qu'il y a que lorsqu'une recherche court. `/communautes` est
 *     indexable — un champ qui aurait tout effacé l'aurait vidée.
 * ==========================================================================
 */
export function CommunitySearch({
  space,
  children,
  label = "Rechercher une communauté",
  placeholder = "Un nom, un thème, un mot de la description…",
  hint,
}: {
  /**
   * Espace qui rend la recherche — il décide de la cible des cartes. Sans
   * valeur par défaut, à dessein : une carte de l'espace connecté qui
   * pointerait vers la fiche publique ferait retomber dans la coquille visiteur.
   */
  space: Space;
  /** La liste rendue par le serveur, montrée tant qu'aucune recherche ne court. */
  children?: React.ReactNode;
  label?: string;
  placeholder?: string;
  /** Une phrase à la place des résultats, au repos, quand il n'y a pas de liste. */
  hint?: React.ReactNode;
}) {
  const routes = routesOf(space);
  const [term, setTerm] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [results, setResults] = React.useState<CommunityCardData[] | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);

  // Numéro de la dernière requête partie. Une réponse plus vieille est jetée.
  const latest = React.useRef(0);

  const trimmed = term.trim();
  const active = trimmed.length >= SEARCH_MIN_LENGTH;

  // Un terme déjà dans l'URL est repris au montage : un lien de recherche
  // partagé ou rechargé retrouve sa recherche. Lu ici, et non à l'initialisation
  // de l'état, parce que ce composant est d'abord rendu par le serveur.
  React.useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("q") ?? "";
    if (fromUrl.trim()) setTerm(fromUrl);
  }, []);

  // L'URL suit la frappe en `replaceState` : la recherche se recharge et se
  // partage, sans remplir le bouton retour d'une entrée par lettre tapée.
  React.useEffect(() => {
    const url = new URL(window.location.href);
    if (trimmed) url.searchParams.set("q", trimmed);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
  }, [trimmed]);

  React.useEffect(() => {
    if (!active) {
      setResults(null);
      setPending(false);
      setFailure(null);
      return;
    }
    const seq = ++latest.current;
    const controller = new AbortController();
    setPending(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/communities?search=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (seq !== latest.current) return;
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setFailure(
            body?.error?.message ?? "La recherche n'a pas abouti. Réessayez dans un instant.",
          );
          setResults([]);
          return;
        }
        const body = (await res.json()) as { data: CommunityCardData[] };
        if (seq !== latest.current) return;
        setFailure(null);
        setResults(body.data);
      } catch (err) {
        // Une requête annulée n'est pas un échec : c'est la frappe qui continue.
        if ((err as Error)?.name === "AbortError" || seq !== latest.current) return;
        setFailure("La recherche n'a pas abouti. Réessayez dans un instant.");
        setResults([]);
      } finally {
        if (seq === latest.current) setPending(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, trimmed]);

  /** Ce que la ligne d'état dit, selon là où en est la frappe. */
  const status = failure
    ? failure
    : !active
      ? trimmed
        ? `Saisissez au moins ${SEARCH_MIN_LENGTH} caractères.`
        : ""
      : pending || results === null
        ? "Recherche…"
        : results.length === 0
          ? `Aucune communauté ne correspond à « ${trimmed} » — essayez un autre mot.`
          : `${results.length} communauté${results.length > 1 ? "s" : ""} trouvée${results.length > 1 ? "s" : ""}.`;

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
          onChange={(e) => setTerm(e.target.value)}
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

      {/* L'état de la recherche, annoncé aussi aux lecteurs d'écran. Le nœud
          existe en permanence : posé seulement quand il a du texte, il ne serait
          pas relu. */}
      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-[13px] text-ink-3">
        {status}
      </p>

      {/*
        Une recherche qui court remplace la liste ; sinon c'est la liste du
        serveur qu'on montre. Aucune donnée de repli nulle part : quand la base
        ne rend rien, l'écran le dit et s'arrête là.
      */}
      {active ? (
        results && results.length > 0 ? (
          <ul className="mt-4 grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
            {results.map((community) => (
              <li key={community.id} className="flex">
                <CommunityCard
                  community={community}
                  href={routes.community(community.slug)}
                  className="flex-1"
                />
              </li>
            ))}
          </ul>
        ) : null
      ) : (
        (children ?? (hint ? <p className="mt-4 text-[14px] text-ink-2">{hint}</p> : null))
      )}
    </div>
  );
}
