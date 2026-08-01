import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Statut textuel avec point de couleur — port de `.stpill`.
 * Le point seul ne porte pas l'information : le libellé est toujours rendu,
 * ce qui garde le composant lisible sans perception des couleurs.
 */
export const stPillVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-bold",
  {
    variants: {
      tone: {
        ok: "text-brand-dark",
        warn: "text-gold-ink",
        bad: "text-danger",
        info: "text-info",
        muted: "text-ink-2",
      },
    },
    defaultVariants: { tone: "muted" },
  },
);

export interface StPillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof stPillVariants> {
  children: React.ReactNode;
}

export function StPill({ className, tone, children, ...props }: StPillProps) {
  return (
    <span className={cn(stPillVariants({ tone }), className)} {...props}>
      <i className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}
