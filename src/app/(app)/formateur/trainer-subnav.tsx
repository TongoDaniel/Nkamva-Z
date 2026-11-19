"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { NavLink } from "@/components/nk/nav-link";
import { cn } from "@/lib/utils";
import { TRAINER_SECTIONS } from "./sections";

/**
 * La barre de sous-navigation de l'espace formateur.
 * ==========================================================================
 * Elle avait été retirée : les sections ne se rejoignaient plus que par les
 * cartes de `/formateur`, tout en bas de la page, et par le fil d'Ariane qui y
 * ramène. Revue du 16 novembre 2026 : passer de ses ventes à sa communauté
 * demandait deux pages et un défilement, sur bureau, pour un espace de huit
 * écrans qu'un formateur parcourt plusieurs fois par jour. Elle revient, en
 * une ligne qui défile, et elle ne colle pas à l'en-tête : elle ne coûte de la
 * hauteur qu'en tête de page.
 *
 * Même liste que les cartes de l'accueil et que l'écran Compte
 * (`sections.ts`) : une entrée ajoutée là-bas apparaît ici.
 *
 * « Lives » sort de `/formateur` (voir `sections.ts`). `/mes-lives` rend donc
 * cette même barre pour un formateur, pour qu'elle ne disparaisse pas au
 * clic.
 * ==========================================================================
 */

const ENTRIES = [
  { href: "/formateur", label: "Tableau de bord" },
  ...TRAINER_SECTIONS.map((section) => ({ href: section.href, label: section.nav })),
];

/** La racine ne s'allume que sur elle-même : toutes les sections commencent par elle. */
function isCurrent(pathname: string, href: string) {
  if (href === "/formateur") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TrainerSubnav() {
  const pathname = usePathname() ?? "/formateur";
  const active = React.useRef<HTMLLIElement | null>(null);

  // Sur téléphone la ligne défile : l'entrée courante doit être visible à
  // l'arrivée, sans quoi « Litiges » s'allume hors de l'écran.
  React.useEffect(() => {
    active.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  // La console d'un direct tient l'écran entier (arbitrage 147) : rien ne
  // s'empile au-dessus de la scène.
  if (pathname.startsWith("/formateur/lives/")) return null;

  return (
    <nav aria-label="Sections de l'espace formateur" className="border-b border-line">
      <ul className="nk-wrap nk-scroll-x flex gap-1">
        {ENTRIES.map((entry) => {
          const current = isCurrent(pathname, entry.href);
          return (
            <li key={entry.href} ref={current ? active : undefined} className="shrink-0">
              <NavLink
                href={entry.href}
                current={current}
                className={cn(
                  "flex min-h-11 items-center whitespace-nowrap px-2.5 text-[13.5px] font-semibold transition-colors sm:px-3.5 sm:text-[14.5px]",
                  current
                    ? "text-ink after:absolute after:inset-x-2.5 after:bottom-0 after:h-[3px] after:rounded-sm after:bg-brand after:content-[''] sm:after:inset-x-3.5"
                    : "text-ink-3 hover:text-ink",
                )}
                pendingClassName="inset-x-2.5 bottom-0"
              >
                {entry.label}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
