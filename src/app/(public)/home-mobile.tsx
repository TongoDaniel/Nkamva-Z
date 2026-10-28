"use client";

import * as React from "react";
import { Tabs } from "@/components/nk/tabs";
import { cn } from "@/lib/utils";

/**
 * Raccourcir la vitrine sur téléphone (L3-21) sans rien retirer de la page.
 * ==========================================================================
 * Mesurée à 375 px, la page d'accueil faisait 7 087 px — près de neuf écrans —
 * et deux sections en portaient 42 % : les deux parcours « apprendre » et
 * « former », empilés, et les trois écrans réels du produit, empilés aussi.
 * Sur grand écran, ces contenus sont côte à côte ; sur téléphone, ils
 * s'additionnaient. Ces deux composants les présentent **l'un après l'autre**
 * sous `lg`, et laissent le grand écran tel qu'il était.
 * ==========================================================================
 */

/**
 * Les deux parcours, sous des onglets « J'apprends / Je forme » sous `lg`. Les
 * deux restent dans la page (rendus côté serveur, indexables) ; seul celui qui
 * n'est pas choisi est masqué, et seulement en dessous de `lg`.
 */
export function HowItWorksSwitch({ learn, teach }: { learn: React.ReactNode; teach: React.ReactNode }) {
  const [lane, setLane] = React.useState<"learn" | "teach">("learn");
  return (
    <>
      <div className="mb-5 flex justify-center lg:hidden">
        <Tabs
          label="Choisir un parcours"
          variant="pill"
          panelId="comment-ca-marche-parcours"
          value={lane}
          onValueChange={(value) => setLane(value as "learn" | "teach")}
          items={[
            { value: "learn", label: "J'apprends" },
            { value: "teach", label: "Je forme" },
          ]}
        />
      </div>
      <div id="comment-ca-marche-parcours" className="grid gap-[26px] lg:grid-cols-2">
        <div className={cn(lane !== "learn" && "hidden lg:block")}>{learn}</div>
        <div className={cn(lane !== "teach" && "hidden lg:block")}>{teach}</div>
      </div>
    </>
  );
}

/**
 * Les écrans du produit : une piste qu'on fait glisser au pouce sous `lg`, une
 * carte à la fois — la suivante dépasse du bord pour dire qu'il y en a d'autres —
 * et les rangées alternées d'origine au-dessus. Un seul arbre : la piste change
 * de forme, pas de contenu.
 */
export function ProductTrack({ children, count }: { children: React.ReactNode; count: number }) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [current, setCurrent] = React.useState(0);

  const sync = React.useCallback(() => {
    const el = trackRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    // Le pas d'une carte à l'autre, écart compris : mesuré entre les deux
    // premières plutôt que déduit de la largeur, qui ignore l'écart.
    const [first, second] = Array.from(el.children) as HTMLElement[];
    const step = first && second ? second.offsetLeft - first.offsetLeft : el.clientWidth;
    setCurrent(Math.min(count - 1, Math.round(el.scrollLeft / Math.max(step, 1))));
  }, [count]);

  const goTo = (index: number) => {
    const el = trackRef.current;
    const first = el?.firstElementChild as HTMLElement | null;
    const card = el?.children[index] as HTMLElement | undefined;
    if (!el || !first || !card) return;
    // Mesuré depuis la première carte : `offsetLeft` se lit par rapport à
    // l'ancêtre positionné, pas à la piste.
    el.scrollTo({ left: card.offsetLeft - first.offsetLeft, behavior: "smooth" });
  };

  return (
    <>
      <div
        ref={trackRef}
        onScroll={sync}
        role="region"
        aria-label="Écrans réels de la plateforme"
        tabIndex={0}
        className={cn(
          // Piste : la forme de base, écrite pour le téléphone.
          "nk-scroll-x -mx-4.5 flex snap-x snap-mandatory scroll-px-4.5 gap-4 px-4.5 md:-mx-7 md:scroll-px-7 md:px-7",
          // Rangées : ce que `lg` rétablit.
          "lg:mx-0 lg:block lg:overflow-visible lg:px-0",
        )}
      >
        {children}
      </div>
      {/* Repère de position — décoratif pour le pouce, les cartes restent
          atteignables au clavier par la région défilante. */}
      <div className="mt-3 flex justify-center gap-1.5 lg:hidden">
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Écran ${i + 1} sur ${count}`}
            aria-current={i === current ? "true" : undefined}
            className={cn(
              "nk-tap h-2 cursor-pointer rounded-full transition-all",
              i === current ? "w-5 bg-brand" : "w-2 bg-line",
            )}
          />
        ))}
      </div>
    </>
  );
}
