"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FaqItem {
  question: string;
  answer: React.ReactNode;
}

/**
 * Accordéon de questions fréquentes — port de `.faq` / `.qa`.
 * Une seule question ouverte à la fois, comme la maquette. La hauteur est
 * animée par `grid-rows` plutôt que par `max-height` : pas de valeur magique
 * à maintenir quand la réponse s'allonge.
 *
 * `id` sert de racine aux identifiants des panneaux, et l'appelant le fournit
 * plutôt que `useId`. Un identifiant `useId` encode la position du composant
 * dans l'arbre React ; en `next dev`, les outils de développement de Next
 * enveloppent chaque segment de route dans un `SegmentViewNode` (dev seulement,
 * cf. `next/dist/next-devtools/userspace/app/segment-explorer-node.js`), ce qui
 * ne donne pas le même arbre au rendu serveur qu'à l'hydratation : les deux
 * rendus produisent alors deux identifiants différents et React signale une
 * divergence d'hydratation qu'il ne rattrape pas. Un identifiant explicite est
 * de surcroît lisible dans l'inspecteur, et deux accordéons sur une même page
 * ne peuvent plus se marcher dessus tant que leurs `id` diffèrent.
 */
export function Faq({
  items,
  id,
  className,
  headingLevel: Heading = "h3",
}: {
  items: FaqItem[];
  /** Racine des `id` de panneaux — unique dans la page. */
  id: string;
  className?: string;
  headingLevel?: "h2" | "h3";
}) {
  const [openIndex, setOpenIndex] = React.useState<number | null>(null);

  return (
    <div className={cn("mx-auto max-w-[780px]", className)}>
      {items.map((item, index) => {
        const open = openIndex === index;
        const panelId = `${id}-panel-${index}`;
        return (
          <div
            key={item.question}
            className={cn(
              "mb-3 overflow-hidden rounded-nk border bg-card transition-colors duration-200",
              open ? "border-brand-tint-2" : "border-line",
            )}
          >
            <Heading>
              <button
                type="button"
                onClick={() => setOpenIndex(open ? null : index)}
                aria-expanded={open}
                aria-controls={panelId}
                className="flex w-full cursor-pointer items-center justify-between gap-4 px-[22px] py-[19px] text-left font-sans text-base font-bold text-ink hover:text-brand"
              >
                {item.question}
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-[30px] flex-none place-items-center rounded-full transition-[transform,background-color] duration-300",
                    open ? "rotate-45 border border-brand bg-card text-brand" : "border border-line bg-card text-ink-2",
                  )}
                >
                  <Plus className="size-[15px]" />
                </span>
              </button>
            </Heading>
            <div
              id={panelId}
              className={cn(
                "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(.3,.7,.3,1)]",
                open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <div className="space-y-2 px-[22px] pb-5 text-[14.5px] leading-[1.65] text-ink-2">
                  {item.answer}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Marque un texte qui reste à arbitrer côté produit (`.ph-copy` dans la
 * maquette). Visible exprès : mieux vaut un trou signalé qu'une valeur
 * inventée qui finirait en production.
 */
export function ToFill({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-gold-ink">
      {children}
    </span>
  );
}
