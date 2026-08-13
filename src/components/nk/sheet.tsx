"use client";

import * as React from "react";
import { Drawer } from "vaul";
import { useHistoryLayer } from "@/hooks/use-history-layer";
import { cn } from "@/lib/utils";

/**
 * Feuille glissante par le bas.
 * ==========================================================================
 * Le pendant de la barre d'onglets : ce qui ne tient pas dans les cinq
 * emplacements se déplie ici, dans le tiers bas de l'écran, à portée de pouce.
 * L'ancienne réponse — un panneau ancré sous l'en-tête `sticky`, ouvert par un
 * burger en haut à droite — obligeait à traverser tout l'écran pour ouvrir puis
 * redescendre pour choisir.
 *
 * Bâtie sur `vaul`, qui était **installé et inutilisé** depuis le début : geste
 * de glissement, inertie et rappel au repos sont fournis, et la base est Radix
 * Dialog, donc le piège de focus et `Échap` avec.
 *
 * Ce que vaul ne fait pas : le bouton retour d'Android. `useHistoryLayer` s'en
 * charge, comme pour les modales.
 * ==========================================================================
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Visible si fournie ; sinon `title` sert de description aux lecteurs d'écran. */
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);
  useHistoryLayer(open, close);

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-190 bg-ink/45 backdrop-blur-[2px]" />
        <Drawer.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-200 mt-24 flex max-h-[86dvh] flex-col rounded-t-nk-lg border-t border-line bg-card outline-none",
            // Le retrait de zone sûre va sur le contenu et non sur le cadre :
            // le fond doit filer jusqu'au bord bas de l'écran, sinon une bande
            // de papier apparaît sous la feuille sur les téléphones à barre
            // gestuelle.
          )}
        >
          {/* Poignée de la maquette iOS/Android — décorative, le glissement
              fonctionne sur toute la feuille. */}
          <div
            aria-hidden="true"
            className="mx-auto mt-2.5 h-1.5 w-11 shrink-0 rounded-full bg-line"
          />
          <div className="px-5 pb-2 pt-3">
            <Drawer.Title className="font-display text-[17px] font-extrabold tracking-[-0.01em]">
              {title}
            </Drawer.Title>
            {description ? (
              <Drawer.Description className="mt-1 text-[13.5px] text-ink-2">
                {description}
              </Drawer.Description>
            ) : (
              <Drawer.Description className="sr-only">{title}</Drawer.Description>
            )}
          </div>
          <div className="nk-safe-b min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
