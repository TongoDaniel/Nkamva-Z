"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Apparition au défilement — port de `[data-sr]` / `.vis` (nkamva-landing.js).
 *
 * Trois garde-fous par rapport à la maquette :
 * - le contenu est visible par défaut et n'est masqué qu'une fois l'observateur
 *   en place, donc rien ne disparaît si le JS ne tourne pas ;
 * - `prefers-reduced-motion` désactive l'effet sans le remplacer par un saut ;
 * - l'observation s'arrête après le premier passage, l'effet ne se rejoue pas.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  /** Rang dans la cascade : 90 ms d'écart, comme `--d` dans la maquette. */
  delay?: number;
  className?: string;
  as?: "div" | "section" | "article" | "li";
}) {
  const ref = React.useRef<HTMLElement | null>(null);
  const [armed, setArmed] = React.useState(false);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }

    // Un élément déjà à l'écran au montage ne doit pas clignoter : on ne masque
    // qu'à partir du moment où l'on sait qu'il est encore sous la ligne de flottaison.
    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.9) {
      setVisible(true);
      return;
    }
    setArmed(true);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<never>}
      style={{ transitionDelay: `${delay * 90}ms` }}
      className={cn(
        "transition-[opacity,transform] duration-[600ms] ease-[cubic-bezier(.2,.7,.3,1)] motion-reduce:transition-none",
        armed && !visible ? "translate-y-5 opacity-0" : "translate-y-0 opacity-100",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
