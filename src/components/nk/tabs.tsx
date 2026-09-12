"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TabItem {
  value: string;
  label: string;
  /** Compteur affiché dans la pastille à droite du libellé. */
  count?: number;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  /**
   * `underline` = `.tabs` public · `pill` = `.adm-tabs` admin ·
   * `chip` = `.ctabs`, la rangée de catégories des listings publics.
   */
  variant?: "underline" | "pill" | "chip";
  /**
   * `sm` resserre la barre pour les colonnes étroites : dans un panneau latéral
   * de 358 px, trois onglets à compteur débordent, et le dernier devient
   * inatteignable — la barre défile, mais sans barre de défilement visible,
   * rien ne le dit.
   *
   * Sous `sm` (640 px), la taille par défaut **adopte d'elle-même** le dessin
   * resserré de la variante `underline` : à 375 px, les quatre rubriques de
   * « Ma communauté » demandaient 364 px pour 327 disponibles, et « Membres »
   * était coupé par le bord de l'écran. Resserrées, elles en demandent 294.
   * Le prop ne sert donc plus qu'aux colonnes étroites d'un grand écran.
   */
  size?: "md" | "sm";
  /** Libellé du groupe d'onglets, obligatoire pour les lecteurs d'écran. */
  label: string;
  /** id du conteneur piloté par les onglets. */
  panelId?: string;
  className?: string;
}

/**
 * Onglets — ports de `.tabs` et `.adm-tabs`.
 * Navigation clavier conforme au motif ARIA « tabs » : flèches pour changer
 * d'onglet, Origine/Fin pour les extrémités, tabindex mobile.
 */
export function Tabs({
  items,
  value,
  onValueChange,
  variant = "underline",
  size = "md",
  label,
  panelId,
  className,
}: TabsProps) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const listRef = React.useRef<HTMLDivElement>(null);
  const activeIndex = Math.max(
    0,
    items.findIndex((i) => i.value === value),
  );

  /**
   * L'onglet courant est ramené dans la fenêtre de la barre.
   *
   * Une barre qui défile sans barre de défilement visible peut cacher l'onglet
   * **actif** : arrivé sur `/formateur/communaute?onglet=membres` à 375 px, les
   * quatre rubriques demandaient 379 px pour 339 disponibles, et « Membres » —
   * la rubrique ouverte, celle que la notification venait de pointer — était
   * coupée par le bord droit. Rien ne disait qu'elle existait.
   *
   * La marge de 24 px laisse volontairement dépasser un morceau de l'onglet
   * voisin : c'est ce débord qui apprend que la barre glisse. Le déplacement
   * est instantané, non animé — au montage, une animation partirait d'une
   * position que personne n'a jamais vue.
   */
  React.useEffect(() => {
    const list = listRef.current;
    const tab = refs.current[activeIndex];
    if (!list || !tab) return;
    if (list.scrollWidth <= list.clientWidth) return;

    // `offsetLeft` se mesure depuis le premier ancêtre positionné, qui n'est pas
    // la barre : les onglets sont `relative`. On passe donc par les rectangles.
    const listBox = list.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    const left = tabBox.left - listBox.left + list.scrollLeft;
    const right = left + tabBox.width;
    const margin = 24;

    if (left - margin < list.scrollLeft) {
      list.scrollLeft = Math.max(0, left - margin);
    } else if (right + margin > list.scrollLeft + list.clientWidth) {
      list.scrollLeft = right + margin - list.clientWidth;
    }
  }, [activeIndex, items.length]);

  const move = (next: number) => {
    const clamped = (next + items.length) % items.length;
    onValueChange(items[clamped].value);
    refs.current[clamped]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        move(activeIndex + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        move(activeIndex - 1);
        break;
      case "Home":
        e.preventDefault();
        move(0);
        break;
      case "End":
        e.preventDefault();
        move(items.length - 1);
        break;
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className={cn(
        variant === "underline"
          ? "mb-6 flex gap-1.5 overflow-x-auto border-b-[1.5px] border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          : variant === "chip"
            ? "flex flex-wrap gap-2"
            : "flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-paper p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((item, i) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={panelId ? `${panelId}-tab-${item.value}` : undefined}
            aria-selected={active}
            aria-controls={panelId}
            tabIndex={active ? 0 : -1}
            onClick={() => onValueChange(item.value)}
            className={cn(
              "relative shrink-0 cursor-pointer whitespace-nowrap font-semibold transition duration-150",
              variant === "underline"
                ? cn(
                    size === "sm"
                      ? "px-2.5 py-2.5 text-[13.5px]"
                      : "px-2.5 py-2.5 text-[13.5px] sm:px-4 sm:py-3 sm:text-[15px]",
                    active ? "text-ink" : "text-ink-3 hover:text-ink",
                    active &&
                      "after:absolute after:inset-x-3 after:-bottom-[1.5px] after:h-[3px] after:rounded-sm after:bg-brand after:content-['']",
                  )
                : // `nk-tap` seulement ici : la variante `underline` dessine
                  // son trait actif avec `after:`, et le pseudo-élément de la
                  // zone tactile le remplacerait. Elle mesure 46 px de haut,
                  // elle n'en a pas besoin — `chip` fait 40 px et `pill` 34.
                  variant === "chip"
                  ? cn(
                      "nk-tap rounded-full border-[1.5px] text-sm",
                      // Cinq filtres à compteur débordaient sur trois rangées
                      // dans le panneau des membres ; resserrés, ils en tiennent
                      // deux, et rendent une rangée entière à la liste.
                      size === "sm" ? "px-3 py-[7px]" : "px-[18px] py-[9px]",
                      active
                        ? "border-ink bg-ink text-paper"
                        : "border-line bg-card text-ink-2 hover:border-ink-3 hover:text-ink",
                    )
                  : cn(
                      "nk-tap rounded-full px-4 py-2 text-[13px]",
                      active ? "bg-ink text-paper" : "text-ink-2 hover:text-ink",
                    ),
            )}
          >
            {item.label}
            {/* Une pastille « 0 » n'apprend rien et coûte 24 px : trois onglets
                à compteur nul débordaient la colonne de modération de la
                console d'animation, et « Salon » sortait du panneau. Le zéro se
                lit déjà dans le panneau lui-même, qui dit « Personne ne demande
                la parole ». */}
            {typeof item.count === "number" && item.count > 0 ? (
              <span
                className={cn(
                  "ml-1.5 rounded-full px-2 py-0.5 text-[13px] font-bold",
                  active && variant === "underline"
                    ? "bg-brand-tint text-brand"
                    : active
                      ? "bg-white/20 text-paper"
                      : "bg-line-2 text-ink-2",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
