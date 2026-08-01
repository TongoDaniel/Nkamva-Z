import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Squelette de chargement — port de `.sk`.
 * La brillance est purement décorative et disparaît sous
 * `prefers-reduced-motion` (règle globale de globals.css).
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-nk-sm bg-[#eae5d8]", className)}
      {...props}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/50 to-transparent"
        style={{ animation: "nk-shine 1.5s infinite" }}
      />
    </div>
  );
}

/** Bloc de chargement annoncé aux lecteurs d'écran. */
export function SkeletonRegion({
  label = "Chargement…",
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Squelette d'une carte ressource, calé sur les proportions de `.rc`. */
export function ResourceCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-nk-lg border border-line bg-card shadow-nk-sm">
      <Skeleton className="aspect-video rounded-none" />
      <div className="flex flex-1 flex-col gap-2 p-[16px_18px_18px]">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-2/3" />
        <div className="mt-auto flex items-center justify-between border-t border-line-2 pt-2.5">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-5 w-16" />
        </div>
      </div>
    </div>
  );
}
