import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Une bande de chiffres clés, dans **une seule carte**.
 * ==========================================================================
 * `StatTile` reste la bonne réponse quand un chiffre mérite sa carte : un
 * tableau de bord, une rangée qu'on lit de loin. Elle ne l'est plus quand trois
 * ou quatre chiffres se suivent, parce qu'une grille de tuiles retombe à une
 * colonne sous `sm` et empile alors trois cartes de 85 px pour afficher trois
 * zéros — près de 300 px d'écran sur un téléphone, avant d'avoir rien dit.
 *
 * La bande les met côte à côte, dans une carte, à toutes les largeurs : deux ou
 * trois colonnes selon leur nombre. Les libellés passent à la ligne si besoin,
 * les valeurs restent alignées entre elles, et l'ensemble tient en une
 * quatre-vingtaine de pixels.
 *
 * Pas de ton coloré ici, contrairement à `StatTile` : sur une bande, quatre
 * pastilles de couleur côte à côte se lisent comme un code qui n'existe pas.
 * Ce qui doit alerter — un montant gelé, un impayé — mérite une phrase, pas
 * une teinte.
 * ==========================================================================
 */
export interface StatStripItem {
  value: React.ReactNode;
  label: React.ReactNode;
  /** Unité collée à la valeur, en petit : « FCFA », « Go »… */
  suffix?: string;
}

/**
 * Le nombre de colonnes suit le nombre de chiffres. Au-delà de quatre, la bande
 * n'est plus le bon objet — c'est une liste.
 */
const COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
};

export function StatStrip({
  items,
  bare,
  className,
}: {
  items: readonly StatStripItem[];
  /**
   * Sans la carte : bande posée **dans** une autre carte, séparée par un filet.
   *
   * Un booléen plutôt qu'une classe qui annule les précédentes : `shadow-none`
   * passé en `className` ne gagnait pas contre le `shadow-nk-sm` du composant,
   * et la bande gardait une ombre à l'intérieur d'une carte qui en avait déjà
   * une. Ce qu'on veut dire, c'est « pas de carte », pas « défais ces trois
   * classes-là ».
   */
  bare?: boolean;
  className?: string;
}) {  if (items.length === 0) return null;
  return (
    <dl
      className={cn(
        "grid gap-x-3 gap-y-4",
        bare
          ? "border-t border-line-2 pt-4"
          : "rounded-nk-lg border border-line bg-card p-4 shadow-nk-sm sm:p-5",
        COLS[items.length] ?? "grid-cols-2 sm:grid-cols-4",
        className,
      )}
    >
      {items.map((item, index) => (
        // Chaque paire dans son propre bloc : un `dl` qui aligne trois `dt`
        // puis trois `dd` dit, au sens du langage, que ces trois termes
        // partagent ces trois définitions. Ici chaque libellé a la sienne.
        // `justify-between` sur toute la hauteur de la rangée : un libellé qui
        // passe à la ligne ne doit pas faire descendre sa seule valeur. Les
        // chiffres se lisent l'un à côté de l'autre ou pas du tout.
        <div key={index} className="flex min-w-0 flex-col justify-between gap-1">
          <dt className="text-[13px] leading-snug text-ink-3">{item.label}</dt>
          <dd className="font-display text-[19px] font-extrabold leading-tight text-ink sm:text-[22px]">
            {item.value}
            {item.suffix ? (
              <small className="ml-1 text-[13px] font-bold text-ink-3">{item.suffix}</small>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
