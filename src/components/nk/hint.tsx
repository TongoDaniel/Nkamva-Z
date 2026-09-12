"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { Info } from "lucide-react";
import { useHistoryLayer } from "@/hooks/use-history-layer";
import { cn } from "@/lib/utils";

/**
 * Infobulle d'aide — le ⓘ posé à côté d'un titre.
 * ==========================================================================
 * Ce composant ne porte qu'une seule famille de textes : **la règle que
 * l'interface applique déjà**. Ce que devient un banni, ce qui distingue une
 * invitation nominative d'un lien de parrainage, pourquoi une facture est
 * regénérée. Lue une fois, cette explication devient du décor : elle coûtait
 * cinq lignes en tête de chaque panneau, soit le premier écran entier d'un
 * téléphone avant la première donnée.
 *
 * Ce qu'elle ne porte **jamais** :
 *
 * - un **avertissement avant un geste coûteux** — « l'accès est suspendu
 *   pendant l'examen », « le motif lui est communiqué tel quel ». Derrière un
 *   clic, un avertissement n'existe plus ; il reste à l'air libre, au moment
 *   où il change ce qu'on s'apprête à faire ;
 * - un **texte contractuel ou commercial** — mentions légales, vitrine, page
 *   d'invitation. C'est du contenu, pas de l'aide : il se lit, il s'indexe ;
 * - un **message d'erreur**, jamais.
 *
 * Mise en œuvre
 * -------------
 * Un vrai bouton et un popover Radix, et non l'attribut `title=` : celui-ci
 * n'existe pas au doigt, n'est pas annoncé par tous les lecteurs d'écran et ne
 * se ferme pas. L'ouverture est **au clic partout**, tactile comme bureau —
 * un seul comportement à apprendre, et rien qui s'ouvre par accident au
 * passage de la souris. Radix fournit `Échap`, la fermeture au clic extérieur,
 * la restitution du focus et le repli automatique quand le bord de l'écran est
 * trop proche ; `useHistoryLayer` ajoute le retour d'Android, comme pour les
 * modales et les feuilles glissantes.
 */
export function Hint({
  label,
  children,
  side = "bottom",
  align = "start",
  className,
}: {
  /**
   * Nom accessible du bouton — ce qu'annonce un lecteur d'écran, et ce que
   * montre l'infobulle native au survol. Formuler la question à laquelle la
   * bulle répond : « Ce que fait un bannissement », pas « Aide ».
   */
  label: string;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  useHistoryLayer(open, close);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className={cn(
            // `align-middle` : le bouton suit un titre au fil du texte, il doit
            // s'asseoir sur sa ligne de base et non déborder sous elle.
            "nk-tap inline-grid size-[22px] shrink-0 cursor-pointer place-items-center rounded-full align-middle",
            "text-ink-3 transition-colors duration-150 hover:bg-line-2 hover:text-ink",
            "data-[state=open]:bg-line-2 data-[state=open]:text-ink",
            className,
          )}
        >
          <Info className="size-[17px]" aria-hidden="true" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side={side}
          align={align}
          sideOffset={8}
          // Le panneau se replie de lui-même près d'un bord ; la marge de
          // collision garde 12 px de respiration sur un téléphone.
          collisionPadding={12}
          className={cn(
            // Au-dessus des modales (z-200) : une règle peut avoir besoin
            // d'être rappelée depuis une modale, pas seulement depuis l'écran.
            "z-210 w-[min(20rem,calc(100vw-1.5rem))] rounded-nk bg-ink p-4 text-[13px] leading-relaxed text-paper shadow-nk-lg outline-none",
            "[&_b]:font-extrabold [&_b]:text-white",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          )}
        >
          {children}
          <Popover.Arrow className="fill-ink" width={14} height={7} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * Titre suivi de son ⓘ, sans que le bouton ne casse l'alignement.
 * Le `<h2>` reste un `<h2>` : le bouton vit à côté, pas dedans — un lecteur
 * d'écran qui liste les titres n'annonce pas « Membres, bouton » .
 */
export function HintedHeading({
  children,
  hint,
  hintLabel,
  className,
  headingClassName,
  level: Heading = "h2",
}: {
  children: React.ReactNode;
  hint: React.ReactNode;
  hintLabel: string;
  className?: string;
  headingClassName?: string;
  level?: "h2" | "h3";
}) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Heading className={cn("text-[19px] font-extrabold", headingClassName)}>{children}</Heading>
      <Hint label={hintLabel}>{hint}</Hint>
    </div>
  );
}
