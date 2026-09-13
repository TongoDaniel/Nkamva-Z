"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Carrousel horizontal — port de `.rhead` + `.rtrack` + `.cnav`.
 *
 * Le défilement natif reste la source de vérité : les flèches ne font que
 * piloter `scrollBy`, donc molette, tactile et clavier fonctionnent même si le
 * JS n'a pas encore pris la main. La piste est une région focusable et nommée,
 * ce qui rend les flèches redondantes plutôt qu'indispensables.
 */
export function ScrollCarousel({
  children,
  label,
  head,
  className,
}: {
  children: React.ReactNode;
  /** Nom accessible de la région défilante. */
  label: string;
  /** En-tête de section, posé à gauche des flèches. */
  head?: React.ReactNode;
  className?: string;
}) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = React.useState(true);
  const [atEnd, setAtEnd] = React.useState(true);

  const sync = React.useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }, []);

  React.useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sync]);

  const scrollByPage = (direction: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(el.clientWidth * 0.8, 280), behavior: "smooth" });
  };

  return (
    <div className={className}>
      <div className="mb-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        {head}
        {/* Pas de flèches sur téléphone : le pouce fait défiler la piste, et
            elles y prenaient une rangée entière sous le titre pour un geste
            que personne n'y fait. */}
        <div className="hidden shrink-0 gap-2 sm:flex">
          <CarouselButton direction="prev" disabled={atStart} onClick={() => scrollByPage(-1)} />
          <CarouselButton direction="next" disabled={atEnd} onClick={() => scrollByPage(1)} />
        </div>
      </div>
      <div
        ref={trackRef}
        onScroll={sync}
        tabIndex={0}
        role="region"
        aria-label={label}
        className="nk-scroll-x -mx-4.5 flex gap-[18px] px-4.5 py-4 md:-mx-7 md:px-7"
      >
        {children}
      </div>
    </div>
  );
}

function CarouselButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "prev" ? ArrowLeft : ArrowRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={
        direction === "prev" ? "Faire défiler vers la gauche" : "Faire défiler vers la droite"
      }
      className={cn(
        "nk-tap relative grid size-[38px] cursor-pointer place-items-center rounded-full border-[1.5px] border-line bg-card text-ink-2",
        "transition duration-150 hover:border-ink hover:text-ink",
        "disabled:cursor-default disabled:opacity-35 disabled:hover:border-line disabled:hover:text-ink-2",
      )}
    >
      <Icon className="size-[17px]" aria-hidden="true" />
    </button>
  );
}
