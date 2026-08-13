"use client";

import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import { NavLink } from "@/components/nk/nav-link";
import { currentIndex, type NavEntry } from "@/components/layouts/nav-entries";
import { cn } from "@/lib/utils";

/**
 * Barre d'onglets basse — arbitrage 111.
 * ==========================================================================
 * Avant elle, la navigation mobile était un burger **en haut à droite**, soit
 * la zone la plus difficile à atteindre au pouce sur un téléphone tenu d'une
 * main, et il fallait deux appuis pour n'importe quelle destination. Elle
 * répondait à la question « comment faire tenir la barre de bureau dans un
 * téléphone ? » ; un produit mobile first pose la question inverse.
 *
 * Quatre destinations, plus « Plus » quand il reste des écrans à atteindre.
 * Au-delà de cinq emplacements, les libellés tombent sous le plancher
 * typographique de l'arbitrage 116 et la barre devient une rangée d'icônes
 * muettes.
 *
 * `nk-safe-b` reprend la barre gestuelle des téléphones à encoche ; sans lui, le
 * dernier onglet passe dessous. La hauteur vit dans `--nk-tabbar-h`
 * (`globals.css`) parce que la barre est `fixed` : c'est la coquille, un autre
 * nœud, qui doit réserver la place sous le contenu via `.nk-tabbar-gap`.
 * ==========================================================================
 */

export function TabBar({
  items,
  pathname,
  onMore,
  moreActive,
  className,
}: {
  items: NavEntry[];
  pathname: string;
  /** Ouvre la feuille « Plus ». Omis pour le visiteur, qui n'en a pas. */
  onMore?: () => void;
  /** Vrai quand la route courante n'est revendiquée par aucun onglet. */
  moreActive?: boolean;
  className?: string;
}) {
  const current = currentIndex(pathname, items);

  return (
    <nav
      aria-label="Navigation principale"
      className={cn(
        "nk-safe-b fixed inset-x-0 bottom-0 z-90 border-t border-line bg-paper/95 backdrop-blur-md lg:hidden",
        className,
      )}
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {items.map((item, index) => {
          const active = index === current;
          const Icon = item.icon;
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <NavLink
                href={item.href}
                current={active}
                className={cn(
                  // Une hauteur pleine plutôt que `.nk-tap` : ici la cible
                  // **est** la case, il n'y a rien à étendre par-dessous.
                  "flex min-h-[var(--nk-tabbar-h)] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-center transition-colors",
                  active ? "text-brand" : "text-ink-2 hover:text-ink",
                )}
                pendingClassName="inset-x-2 bottom-1"
              >
                <Icon
                  className={cn("size-[21px] shrink-0", active && "stroke-[2.4]")}
                  aria-hidden="true"
                />
                {/* 13 px est le plancher de l'arbitrage 116. `truncate` plutôt
                    qu'un libellé raccourci : « Mes ressources » reste lisible
                    par les lecteurs d'écran même quand l'œil voit « Mes res… ». */}
                <span className="w-full truncate text-[13px] font-semibold leading-none">
                  {item.label}
                </span>
              </NavLink>
            </li>
          );
        })}

        {onMore ? (
          <li className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onMore}
              aria-haspopup="dialog"
              aria-current={moreActive ? "page" : undefined}
              className={cn(
                "flex min-h-[var(--nk-tabbar-h)] w-full cursor-pointer flex-col items-center justify-center gap-0.5 px-1 py-1.5 transition-colors",
                moreActive ? "text-brand" : "text-ink-2 hover:text-ink",
              )}
            >
              <MoreHorizontal
                className={cn("size-[21px] shrink-0", moreActive && "stroke-[2.4]")}
                aria-hidden="true"
              />
              <span className="text-[13px] font-semibold leading-none">Plus</span>
            </button>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
