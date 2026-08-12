"use client";

import * as React from "react";
import Link, { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";

/**
 * Le trait qui dit qu'une navigation est partie.
 *
 * Mesuré le 10 août 2026 : une navigation coûte de 300 à 600 ms, et jusqu'ici
 * aucune ne produisait le moindre signal — l'écran restait figé sur la page
 * qu'on venait de quitter. Le trait comble ce silence sans rien déplacer :
 * il se pose en surimpression, sous le libellé, et ne participe pas au flux.
 *
 * Il est *indéterminé* à dessein. On ne sait pas combien de temps le serveur
 * mettra ; une barre qui afficherait une progression l'inventerait.
 *
 * Doit vivre **sous** un `<Link>` : `useLinkStatus` lit la navigation en cours
 * par le contexte que celui-ci ouvre. Le lien parent doit être `relative`.
 *
 * Le trait n'est pas annoncé aux lecteurs d'écran : le changement de page l'est
 * déjà, et un texte glissé ici entrerait dans le nom accessible du lien.
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-x-3 bottom-1 h-[2px] overflow-hidden rounded-full bg-current/25",
        className,
      )}
    >
      <span
        className="block h-full w-1/4 rounded-full bg-current"
        style={{ animation: "nk-nav 1s ease-in-out infinite" }}
      />
    </span>
  );
}

export interface NavLinkProps extends React.ComponentPropsWithoutRef<typeof Link> {
  /** Entrée correspondant à la page affichée — pose `aria-current`. */
  current?: boolean;
  /** Ajustement du trait, quand la géométrie du lien s'y prête mal. */
  pendingClassName?: string;
}

/** Entrée de navigation qui répond au clic. */
export function NavLink({
  current,
  className,
  pendingClassName,
  children,
  ...props
}: NavLinkProps) {
  return (
    <Link
      aria-current={current ? "page" : undefined}
      className={cn("relative", className)}
      {...props}
    >
      {children}
      <LinkPending className={pendingClassName} />
    </Link>
  );
}
