"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { TRAINER_SECTIONS } from "./sections";

const ITEMS = [{ href: "/formateur", label: "Vue d'ensemble" }, ...TRAINER_SECTIONS];

/**
 * `/formateur` est le préfixe de toutes les autres entrées : sans l'égalité
 * stricte, « Vue d'ensemble » resterait actif sur les cinq sections.
 */
function isActive(pathname: string, href: string) {
  if (href === "/formateur") return pathname === "/formateur";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Barre de sous-navigation de l'espace formateur. Ces cinq écrans ont quitté la
 * barre principale, qui n'y garde que « Espace formateur » : ils se rejoignent
 * d'ici, et sur mobile — où le menu du compte n'existe pas — c'est leur seul
 * chemin, d'où le défilement horizontal plutôt qu'un repli sur plusieurs lignes.
 */
export function TrainerNav() {
  const pathname = usePathname() ?? "/formateur";

  return (
    <div className="border-b border-line bg-card">
      <nav
        aria-label="Navigation de l'espace formateur"
        className="nk-wrap flex gap-1 overflow-x-auto py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
            className={cn(
              "nk-tap relative shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-[14.5px] font-semibold transition duration-150",
              isActive(pathname, item.href)
                ? "bg-ink text-paper"
                : "text-ink-2 hover:bg-paper hover:text-ink",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
