"use client";

import * as React from "react";
import Link, { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";
import { type VariantProps } from "class-variance-authority";
import { btnVariants } from "./button";
import { cn } from "@/lib/utils";

/**
 * Lien dessiné en bouton, qui montre qu'il a été cliqué.
 *
 * `<Btn asChild><Link/></Btn>` ne peut structurellement pas le faire : `Slot`
 * n'accepte qu'un enfant unique, alors que l'état occupé de `Btn` rend un
 * fragment de deux nœuds (le spinner et le libellé). La prop `loading` y est
 * donc inutilisable — et comme aucune route ne porte de `loading.tsx`, cliquer
 * sur « Explorer le catalogue » ne produisait aucun signal pendant tout
 * l'aller-retour serveur.
 *
 * `useLinkStatus` donne cet état sans réimplémenter la navigation : le `<a>`
 * reste un vrai lien, donc le clic milieu, le ctrl-clic, l'ouverture dans un
 * onglet et l'indexation continuent de fonctionner.
 *
 * Le spinner n'est pas annoncé aux lecteurs d'écran : la navigation l'est déjà
 * par le changement de page. Il répond au doigt qui vient d'appuyer, pas à la
 * synthèse vocale.
 */

type LinkProps = React.ComponentPropsWithoutRef<typeof Link>;

export interface BtnLinkProps
  extends Omit<LinkProps, "className" | "color">,
    VariantProps<typeof btnVariants> {
  className?: string;
}

/**
 * Doit vivre *sous* le `<Link>` : `useLinkStatus` lit la navigation en cours
 * par le contexte que celui-ci ouvre.
 */
function BtnLinkBody({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  if (!pending) return children;
  return (
    <>
      <Loader2 className="animate-spin" aria-hidden="true" />
      <span>{children}</span>
    </>
  );
}

export function BtnLink({
  className,
  variant,
  size,
  block,
  children,
  ...props
}: BtnLinkProps) {
  return (
    <Link className={cn(btnVariants({ variant, size, block }), className)} {...props}>
      <BtnLinkBody>{children}</BtnLinkBody>
    </Link>
  );
}
