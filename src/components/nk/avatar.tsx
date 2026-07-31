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
        xs: "size-[22px] text-[10px]",
        sm: "size-9 text-xs",
        md: "size-[42px] text-sm",
        lg: "size-16 text-[22px]",
      },
      tone: {
        brand: "bg-linear-to-br from-brand to-[#0d8a63]",
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
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        label
      )}
    </span>
  );
}
