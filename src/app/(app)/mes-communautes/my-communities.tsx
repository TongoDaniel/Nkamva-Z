"use client";

import * as React from "react";
import { AlertTriangle, MessageSquareOff, Search, Settings } from "lucide-react";
import { BtnLink } from "@/components/nk/button-link";
import { StPill } from "@/components/nk/status-pill";
import {
  COMMUNITY_GRID,
  CommunityCard,
  type CommunityCardData,
} from "@/components/nk/community-card";

/**
 * Une des communautés de la personne : celle qu'elle anime, ou une où elle est.
 *
 * Tout est déjà mis en forme par le serveur — libellés, dates, cibles des
 * liens. Le composant ne recalcule rien : il filtre et il rend. Les dates ne
 * traversent donc pas la frontière en objets `Date`, et `fmtDate` reste d'un
 * seul côté.
 */
export interface MyCommunityItem {
  card: CommunityCardData;
  /** Cible du titre, calculée par le serveur avec la table des espaces. */
  href: string;
  /** Celle qu'elle anime passe devant et se distingue à l'œil. */
  own: boolean;
  /** Pour la sienne : « Ouverte à tous » ou « Sur invitation ». */
  visibilityLabel?: string;
  /** Pour une adhésion : son état, et ce qu'il faut en faire. */
  membership?: {
    /** `ACTIVE`, `PAST_DUE`, `BANNED`… tel qu'écrit en base. */
    status: string;
    canceled: boolean;
    /** « Prochaine échéance le 12 octobre 2026 », déjà formaté. */
    dueLabel: string;
    actionHref: string;
    actionLabel: string;
    /** Une échéance à régler : le bouton devient l'action principale. */
    urgent: boolean;
  };
}

/**
 * En deçà, un champ de filtre au-dessus de deux cartes serait du bruit : on
 * les voit toutes d'un coup d'œil. Douze cartes, c'est quatre rangées au plus
 * large — à ce moment-là, chercher devient plus rapide que parcourir.
 */
const FILTER_FROM = 7;

/** Compare sans se soucier des accents ni de la casse : « communauté » trouve « Communaute ». */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Ses communautés, dans une seule grille.
 *
 * Elles vivaient en deux blocs : la sienne dans un encart à part, les autres
 * dans une liste en dessous, avec un état vide entre les deux qui annonçait
 * « vous ne suivez aucune autre communauté » à qui venait d'en voir une. Une
 * grille, un ordre — la sienne d'abord —, et le même gabarit de carte partout.
 *
 * Le filtre est **local**, et c'est la seule recherche de ce produit qui le
 * soit : ses communautés tiennent sur un écran, elles sont déjà là, entières.
 * Rien à demander au serveur, donc rien à amortir ni à plafonner. La
 * découverte, elle, interroge le serveur à chaque frappe — parce qu'elle
 * pagine, et qu'une page suivante n'existe pas ici (voir `CommunityBrowser`).
 */
export function MyCommunities({ items }: { items: MyCommunityItem[] }) {
  const [filter, setFilter] = React.useState("");

  const needle = fold(filter.trim());
  const shown = needle
    ? items.filter((item) =>
        [item.card.name, item.card.trainerName ?? "", item.card.description ?? ""].some((field) =>
          fold(field).includes(needle),
        ),
      )
    : items;

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="nk-mes-communautes" className="mt-6">
      <h2 id="nk-mes-communautes" className="sr-only">
        Mes communautés
      </h2>

      {items.length >= FILTER_FROM ? (
        <div className="relative mb-4">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-ink-3"
            aria-hidden="true"
          />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filtrer mes communautés"
            placeholder="Filtrer parmi mes communautés…"
            className="w-full rounded-xl border-[1.5px] border-line bg-card py-3 pl-11 pr-4 text-[15px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-3 focus:border-brand focus:ring-[3px] focus:ring-brand/25"
          />
        </div>
      ) : null}

      {needle ? (
        <p role="status" aria-live="polite" className="mb-3 text-[13px] text-ink-3">
          {shown.length === 0
            ? `Aucune de vos communautés ne correspond à « ${filter.trim()} ».`
            : `${shown.length} sur ${items.length}.`}
        </p>
      ) : null}

      <ul className={COMMUNITY_GRID}>
        {shown.map((item) => {
          // Calculée, et non rendue en composant : `<Badge/>` est toujours un
          // nœud vrai, même quand il ne rend rien, et la carte réservait alors
          // une rangée vide — haute de zéro, mais qui consomme l'écart de la
          // grille.
          const badge = badgeFor(item);
          return (
          <li key={item.card.id} className="flex">
            <CommunityCard
              community={item.card}
              href={item.href}
              className="flex-1"
              highlight={item.own}
              hideTrainerName={item.own}
              badge={badge}
              meta={item.own ? item.visibilityLabel : item.membership?.dueLabel}
              action={
                item.own ? (
                  // Sa gestion, pas sa fiche publique — et cette adresse ne
                  // dépend pas de l'espace : l'écran d'animation n'existe que
                  // dans la coquille connectée.
                  <BtnLink href="/formateur/communaute" size="sm">
                    <Settings aria-hidden="true" />
                    Gérer
                  </BtnLink>
                ) : item.membership ? (
                  <BtnLink
                    href={item.membership.actionHref}
                    variant={item.membership.urgent ? "p" : "o"}
                    size="sm"
                  >
                    {item.membership.actionLabel}
                  </BtnLink>
                ) : null
              }
            />
          </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * L'état de la personne dans cette communauté, quand il ne se devine pas.
 *
 * Rien pour celle qu'elle anime : le bouton « Gérer » et le fond teinté le
 * disent déjà, et une pastille « Ma communauté » par-dessus ne faisait que
 * rallonger la carte. Rien non plus pour un membre à jour — « Membre » sur une
 * carte qui figure dans *ses* communautés n'apprend rien. Il reste ce qui
 * demande une décision ou explique un silence.
 */
function badgeFor(item: MyCommunityItem): React.ReactNode {
  const membership = item.membership;
  if (item.own || !membership) return null;
  if (membership.status === "PAST_DUE") {
    return (
      <StPill tone="warn">
        <AlertTriangle className="size-3.5" aria-hidden="true" /> Échéance à régler
      </StPill>
    );
  }
  if (membership.status === "BANNED") {
    return (
      <StPill tone="muted">
        <MessageSquareOff className="size-3.5" aria-hidden="true" /> Parole retirée
      </StPill>
    );
  }
  if (membership.canceled) return <StPill tone="muted">Résiliée</StPill>;
  return null;
}
