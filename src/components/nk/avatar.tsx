import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Initiales d'un nom complet ("Aminata Sow" → "AS"). */
export function initials(name?: string | null, fallback = "?"): string {
  if (!name?.trim()) return fallback;
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || fallback;
}

const avatarVariants = cva(
  "inline-grid shrink-0 place-items-center rounded-full font-sans font-bold text-white overflow-hidden",
  {
    variants: {
      size: {
        xs: "size-[22px] text-[13px]",
        sm: "size-9 text-[13px]",
        md: "size-[42px] text-sm",
        lg: "size-16 text-[22px]",
      },
      tone: {
        // `.authcard .big` de la maquette : dégradé marque → azur. `.ava`
        // gardait un vert codé en dur, resté de l'accent précédent — non repris,
        // il produisait un dégradé bleu vers vert depuis la bascule de marque.
        // Les deux arrêts suivent l'accent (`--brand-2` = azur, vert sous
        // `.nk-admin`) : pointer `azure` en dur rouvrait le même dégradé bicolore
        // dans le back-office.
        brand: "bg-linear-to-br from-brand to-brand-2",
        tint: "bg-brand-tint-2 !text-brand-dark",
        ink: "bg-ink",
      },
    },
    defaultVariants: { size: "md", tone: "brand" },
  },
);

export interface AvatarProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof avatarVariants> {
  name?: string | null;
  src?: string | null;
  /** Décrit l'avatar aux lecteurs d'écran ; omis, il est traité comme décoratif. */
  alt?: string;
  ring?: boolean;
}

export function Avatar({ className, size, tone, name, src, alt, ring, ...props }: AvatarProps) {
  const label = initials(name);
  return (
    <span
      className={cn(avatarVariants({ size, tone }), ring && "border-2 border-white shadow-nk-sm", className)}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      {...props}
    >
      {/*
        Les initiales restent **sous** la photo, elles ne la remplacent pas.

        Une adresse qui ne répond pas — photo purgée du stockage, URL externe
        d'un compte d'essai, réseau coupé — ne laisse alors pas un rond vide mais
        les initiales, sans une ligne de JavaScript : l'image en échec n'affiche
        rien, et ce qui est derrière réapparaît. `onError` aurait demandé de
        rendre ce composant client, alors qu'il est posé par des écrans serveur
        dans presque toute l'application.
      */}
      <span className={cn("grid size-full place-items-center", src && "col-start-1 row-start-1")}>
        {label}
      </span>
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className="col-start-1 row-start-1 size-full object-cover"
        />
      ) : null}
    </span>
  );
}
