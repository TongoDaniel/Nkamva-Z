import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bouton NkamVa — port de `.btn` / `.btn-p|dark|o|t` / `.btn-sm|lg` de la maquette.
 * `asChild` permet de rendre un `<Link>` avec l'apparence d'un bouton.
 */
export const btnVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    // `nk-tap` garantit 44 px de zone tactile sur écran tactile sans changer le
    // dessin : la taille `sm` ne fait que 40 px de haut. `relative` ancre le
    // pseudo-élément ; tailwind-merge le laisse céder à un `absolute` passé en
    // `className`.
    "nk-tap relative",
    "font-sans font-semibold leading-none rounded-full border-[1.5px] border-transparent",
    "cursor-pointer no-underline select-none",
    "transition-[transform,box-shadow,background-color,border-color,color] duration-150",
    "active:scale-[0.97]",
    "disabled:opacity-50 disabled:pointer-events-none aria-disabled:opacity-50 aria-disabled:pointer-events-none",
    "[&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        p: "bg-brand text-white hover:bg-brand-dark hover:-translate-y-px hover:shadow-brand",
        dark: "bg-ink text-paper hover:bg-black hover:text-white hover:-translate-y-px",
        o: "bg-card text-ink border-line hover:border-ink",
        t: "bg-transparent text-brand hover:bg-brand-tint",
        danger: "bg-danger-tint text-danger border-danger-tint hover:bg-danger hover:text-white hover:border-danger",
        // Les deux variantes ci-dessous ne vivent que sur fond navy (`.cta`).
        light: "bg-white text-navy hover:bg-paper hover:text-navy hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(0,0,0,.3)]",
        gh: "bg-transparent text-white border-white/30 hover:border-white hover:text-white",
      },
      size: {
        sm: "px-4 py-[9px] text-[13.5px] [&_svg]:size-4",
        md: "px-[22px] py-[13px] text-[15px] [&_svg]:size-[17px]",
        lg: "px-7 py-4 text-base [&_svg]:size-[18px]",
      },
      block: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: { variant: "p", size: "md", block: false },
  },
);

export interface BtnProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color">,
    VariantProps<typeof btnVariants> {
  asChild?: boolean;
  /** Affiche un spinner et neutralise le bouton, en conservant sa largeur. */
  loading?: boolean;
}

export const Btn = React.forwardRef<HTMLButtonElement, BtnProps>(function Btn(
  { className, variant, size, block, asChild, loading, children, disabled, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      className={cn(btnVariants({ variant, size, block }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="animate-spin" aria-hidden="true" />
          <span>{children}</span>
        </>
      ) : (
        children
      )}
    </Comp>
  );
});

/** Bouton icône rond de la topbar (`.icbtn`). */
export const IconBtn = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { badge?: number | null }
>(function IconBtn({ className, children, badge, type, ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={cn(
        "nk-tap relative grid size-[42px] place-items-center rounded-full border border-line bg-card text-ink-2",
        "cursor-pointer transition duration-150 hover:border-ink-3 hover:text-ink hover:-translate-y-px",
        "[&_svg]:size-[19px]",
        className,
      )}
      {...props}
    >
      {children}
      {badge ? (
        <span
          className="absolute -right-1 -top-1 min-w-[18px] rounded-full border-2 border-paper bg-clay px-[5px] text-center text-[13px] font-bold leading-[18px] text-white"
          aria-hidden="true"
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </button>
  );
});
