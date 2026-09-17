"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Une commande ronde de la barre d'un direct — micro, caméra, écran, main levée,
 * et, sur téléphone, les volets du panneau.
 *
 * Elle vivait en double, à l'identique, dans la salle de l'apprenant et dans la
 * console de l'animateur (arbitrage 145). Le jour où le partage d'écran est
 * arrivé, il a fallu ajouter le même bouton des deux côtés : la troisième copie
 * a décidé de l'extraction.
 *
 * Deux natures de bouton, et elles ne se lisent pas pareil :
 *
 * - **une commande** (`kind="device"`) a trois états et pas deux : **allumé**
 *   (la piste sort), **éteint** (elle peut sortir, elle ne sort pas — c'est le
 *   rouge, un avertissement destiné à celui qui se croit entendu) et
 *   **indisponible** (le serveur n'ouvre pas la source). Le troisième ne se
 *   devine pas : `label` doit dire pourquoi.
 * - **une bascule** (`kind="toggle"`, arbitrage 148) : main levée, partage
 *   d'écran, volet du panneau. Elle n'a rien d'« éteint » au sens du micro — une
 *   main baissée ou un écran non partagé ne sont pas des alertes, et les
 *   peindre en rouge, comme c'était le cas, disait le contraire. Ouverte, elle
 *   prend la couleur de la marque ; fermée, elle reste neutre.
 *
 * - **un volet** (`kind="panel"`) choisit ce que montre le panneau sous la
 *   scène. Ouvert, il prend le bleu **pâle**, celui du choix de disposition en
 *   haut de la scène : c'est un choix de lecture, pas un geste adressé à la
 *   salle. En bleu plein, il se confondait avec une main levée voisine — trois
 *   ronds identiques d'affilée, dont un seul disait quelque chose aux autres.
 *
 * Seuls le micro et la caméra sont des `device` : c'est là, et là seulement,
 * que le rouge avertit quelqu'un qui se croit entendu ou vu.
 *
 * Les couleurs viennent des jetons `--live-*` (`globals.css`) : le bouton suit
 * le ton de la salle qui le porte, sombre ou clair.
 */
export function LiveControlButton({
  active,
  disabled,
  label,
  onClick,
  kind = "device",
  /** Pastille chiffrée — le nombre de participants sur le volet du même nom. */
  count,
  controls,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  kind?: "device" | "toggle" | "panel";
  count?: number;
  /** `aria-controls` : l'élément que le bouton pilote, pour un volet. */
  controls?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={count === undefined ? label : `${label} (${count})`}
      aria-controls={controls}
      title={label}
      className={cn(
        // 44 px sous `sm` : sept commandes doivent tenir sur une ligne de
        // 375 px, et 44 est le plancher d'une cible tactile.
        "relative grid size-11 shrink-0 place-items-center rounded-full border transition sm:size-12 [&_svg]:size-[18px] sm:[&_svg]:size-[19px]",
        disabled
          ? "cursor-not-allowed border-[var(--live-btn-off-line)] bg-[var(--live-btn-off)] text-[var(--live-btn-off-fg)]"
          : kind === "toggle" || kind === "panel"
            ? active
              ? kind === "toggle"
                ? "cursor-pointer border-brand bg-brand text-white"
                : "cursor-pointer border-[var(--live-glass-on-fg)] bg-[var(--live-glass-on)] text-[var(--live-glass-on-fg)]"
              : "cursor-pointer border-[var(--live-btn-line)] bg-[var(--live-btn)] text-[var(--live-fg)] hover:bg-[var(--live-btn-hover)]"
            : active
              ? "cursor-pointer border-[var(--live-btn-line)] bg-[var(--live-btn)] text-[var(--live-fg)] hover:bg-[var(--live-btn-hover)]"
              : "cursor-pointer border-danger/40 bg-danger-tint text-danger hover:bg-danger/20",
      )}
    >
      {children}
      {count !== undefined && count > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -right-1.5 -top-1.5 grid h-[22px] min-w-[22px] place-items-center rounded-full border-2 border-[var(--live-bg)] bg-ink px-1 text-[13px] font-extrabold leading-none text-white"
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
