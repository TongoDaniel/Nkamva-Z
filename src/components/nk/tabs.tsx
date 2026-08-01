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
  /** `underline` = `.tabs` public · `pill` = `.adm-tabs` admin. */
  variant?: "underline" | "pill";
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
  label,
  panelId,
  className,
}: TabsProps) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(
    0,
    items.findIndex((i) => i.value === value),
  );

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
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className={cn(
        variant === "underline"
          ? "mb-6 flex gap-1.5 overflow-x-auto border-b-[1.5px] border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                    "px-4 py-3 text-[15px]",
                    active ? "text-ink" : "text-ink-3 hover:text-ink",
                    active &&
                      "after:absolute after:inset-x-3 after:-bottom-[1.5px] after:h-[3px] after:rounded-sm after:bg-brand after:content-['']",
                  )
                : cn(
                    "rounded-full px-4 py-2 text-[13px]",
                    active ? "bg-ink text-paper" : "text-ink-2 hover:text-ink",
                  ),
            )}
          >
            {item.label}
            {typeof item.count === "number" ? (
              <span
                className={cn(
                  "ml-1.5 rounded-full px-2 py-0.5 text-xs font-bold",
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
