"use client";

import * as React from "react";
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
 * Cinq destinations. La dernière, le compte, est une route comme les autres —
 * elle ouvrait une feuille glissante tant que l'écran n'existait pas.
 *
 * ## La pilule, et les libellés
 *
 * La barre ne tient plus le bord bas : elle **flotte** au-dessus du contenu,
 * qui défile derrière elle. Le bandeau qui la porte ne prend donc aucun clic
 * (`pointer-events-none`) ; seule la pilule en prend. Sans cette précaution,
 * une bande transparente de la largeur de l'écran avalerait les appuis de part
 * et d'autre.
 *
 * `labels` décide du reste. Dans l'espace connecté il vaut `false` : cinq
 * icônes nues, à la manière des applications qu'on ouvre tous les jours. Sur la
 * vitrine il reste vrai — un visiteur découvre le produit, et « Connexion » ne
 * se devine pas à un glyphe.
 *
 * Un libellé masqué reste un libellé : chaque case porte alors son nom en
 * `aria-label`. Sans lui, la barre disparaît purement et simplement pour qui
 * navigue au lecteur d'écran, et rien à l'écran ne le signale.
 *
 * `nk-safe-b` reprend la barre gestuelle des téléphones à encoche. La hauteur
 * vit dans `--nk-tabbar-h` et la marge sous la pilule dans `--nk-tabbar-float`
 * (`globals.css`), parce que la barre est `fixed` : c'est la coquille, un autre
 * nœud, qui doit réserver la place sous le contenu via `.nk-tabbar-gap`.
 * ==========================================================================
 */

export function TabBar({
  items,
  pathname,
  portrait,
  portraitFor,
  labels = true,
  className,
}: {
  items: NavEntry[];
  pathname: string;
  /**
   * Ce que montre la case `portraitFor` à la place de son icône. L'espace
   * connecté y met le portrait de la personne : c'est **son** compte, et la
   * case se repère d'un coup d'œil au milieu de quatre glyphes gris.
   */
  portrait?: React.ReactNode;
  /** `href` de la case qui porte le portrait. */
  portraitFor?: string;
  /** Faux pour des icônes nues. Le nom reste alors porté par `aria-label`. */
  labels?: boolean;
  className?: string;
}) {
  const current = currentIndex(pathname, items);

  /**
   * Ce qui dit où l'on est quand plus aucun mot ne le dit : la couleur de
   * l'icône et un point sous elle — plus de disque teinté derrière.
   */
  const chip = (active: boolean) =>
    cn(
      "relative grid place-items-center transition-colors",
      labels ? "size-auto" : "size-10 rounded-full",
      !labels && active && "text-brand after:absolute after:bottom-0 after:size-1 after:rounded-full after:bg-brand",
    );

  return (
    <nav
      aria-label="Navigation principale"
      className={cn(
        "nk-safe-b pointer-events-none fixed inset-x-0 bottom-0 z-90 px-3 lg:hidden",
        className,
      )}
    >
      {/*
        La hauteur vit sur la pilule, pas sur les cases : `box-sizing: border-box`
        y range la bordure, si bien que `--nk-tabbar-h` mesure ce que la barre
        occupe **vraiment**. Portée par les cases, la même valeur donnait deux
        pixels de plus une fois la bordure ajoutée — assez pour que le bas de la
        messagerie passe sous le bord de la pilule.
      */}
      <ul
        className={cn(
          "pointer-events-auto mx-auto flex max-w-sm items-stretch",
          // Plus opaque que les en-têtes : la pilule flotte **au-dessus** du
          // contenu, qui défile juste derrière elle, et non sous une bande
          // ancrée en tête de page.
          "nk-glass [--nk-glass-frosted:84%] [--nk-glass-solid:95%]",
          "min-h-[var(--nk-tabbar-h)] mb-[var(--nk-tabbar-float)] rounded-full border border-line px-1.5 shadow-nk-lg",
        )}
      >
        {items.map((item, index) => {
          const active = index === current;
          const Icon = item.icon;
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <NavLink
                href={item.href}
                current={active}
                aria-label={labels ? undefined : item.label}
                className={cn(
                  // Une hauteur pleine plutôt que `.nk-tap` : ici la cible
                  // **est** la case, il n'y a rien à étendre par-dessous.
                  "flex h-full flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-center transition-colors",
                  active ? "text-brand" : "text-ink-2 hover:text-ink",
                )}
                pendingClassName="inset-x-2 bottom-1"
              >
                <span className={chip(active)}>
                  {portrait && item.href === portraitFor ? (
                    portrait
                  ) : (
                    <Icon
                      className={cn("size-[21px] shrink-0", active && "stroke-[2.4]")}
                      aria-hidden="true"
                    />
                  )}
                </span>
                {/* 13 px est le plancher de l'arbitrage 116. `truncate` plutôt
                    qu'un libellé raccourci : « Mes ressources » reste lisible
                    par les lecteurs d'écran même quand l'œil voit « Mes res… ». */}
                {labels ? (
                  <span className="w-full truncate text-[13px] font-semibold leading-none">
                    {item.label}
                  </span>
                ) : null}
              </NavLink>
            </li>
          );
        })}

      </ul>
    </nav>
  );
}
