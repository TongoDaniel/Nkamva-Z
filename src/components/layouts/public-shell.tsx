"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BtnLink } from "@/components/nk/button-link";
import { Logo } from "@/components/nk/logo";
import { TabBar } from "@/components/nk/tab-bar";
import { cn } from "@/lib/utils";
import { isActive, PUBLIC_BAR as NAV, VISITOR_TABS } from "./nav-entries";

const FOOTER_COLUMNS: Array<{ title: string; links: Array<{ href: string; label: string }> }> = [
  {
    title: "Plateforme",
    links: [
      { href: "/ressources", label: "Ressources" },
      { href: "/communautes", label: "Communautés" },
      { href: "/formateurs", label: "Formateurs" },
      { href: "/tarifs", label: "Tarifs" },
    ],
  },
  {
    title: "Formateurs",
    links: [
      { href: "/devenir-formateur", label: "Devenir formateur" },
      { href: "/aide", label: "Aide & FAQ" },
    ],
  },
  {
    title: "Légal",
    links: [
      { href: "/legal/conditions", label: "Conditions d'utilisation" },
      { href: "/legal/confidentialite", label: "Confidentialité" },
      { href: "/legal/mentions", label: "Mentions légales" },
      { href: "/contact", label: "Contact" },
    ],
  },
];

/**
 * Barre supérieure publique — port de `.topbar`.
 *
 * Le burger et son panneau ont disparu : sous `lg`, la navigation est la barre
 * d'onglets basse (arbitrage 111), rendue par `PublicShell`. L'en-tête ne garde
 * que le logo et les deux entrées de compte, qui ne sont pas des destinations
 * de navigation.
 */
export function PublicTopbar() {
  const pathname = usePathname() ?? "/";

  return (
    <header className="nk-glass sticky top-0 z-50 border-b border-line">
      <div className="nk-wrap flex h-[62px] items-center gap-4 md:h-[70px] md:gap-7">
        <Logo compact />

        {/* « du site » et non « principale » : la barre d'onglets basse porte déjà
            ce dernier nom, et deux repères de navigation homonymes sur la même
            page laissent un lecteur d'écran sans moyen de les distinguer. */}
        <nav aria-label="Navigation du site" className="hidden flex-1 gap-1 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={cn(
                "rounded-full px-3.5 py-2 text-[14.5px] font-semibold transition duration-150",
                isActive(pathname, item.href)
                  ? "bg-navy text-paper"
                  : "text-ink-2 hover:bg-ink/5 hover:text-ink",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          {/* Pas de favoris ici : ils appartiennent à un compte. Le cœur menait
              une personne non connectée vers un écran qui la renvoyait aussitôt
              se connecter. L'entrée vit dans le menu du compte, côté connecté. */}
          <BtnLink href="/auth/connexion" variant="t" size="sm" className="hidden lg:inline-flex">
            Se connecter
          </BtnLink>
          <BtnLink href="/auth/inscription" variant="p" size="sm">S&apos;inscrire</BtnLink>
        </div>
      </div>
    </header>
  );
}

/** Pied de page public — port de `.bigfoot`. */
export function PublicFooter() {
  return (
    <footer className="mt-10 border-t border-line bg-paper sm:mt-[72px]">
      {/* Mesuré à 835 px de haut à 375 px de large, pour un écran qui en fait
          812 : le pied de page était un écran entier. Les trois colonnes de
          liens tiennent deux de front sur téléphone — leurs libellés font un
          mot — et la respiration reprend sa taille dès 640 px. */}
      <div className="nk-wrap grid grid-cols-2 gap-x-5 gap-y-7 pb-7 pt-8 sm:grid-cols-2 sm:gap-10 sm:pb-10 sm:pt-[52px] lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="col-span-2 sm:col-span-1">
          <Logo />
          <p className="mt-3 max-w-[34ch] text-sm leading-relaxed text-ink-2">
            Apprendre et former à l&apos;unité, en FCFA, par mobile money ou carte bancaire.
          </p>
        </div>
        {FOOTER_COLUMNS.map((col) => (
          <div key={col.title}>
            <h2 className="mb-3.5 mt-1.5 font-sans text-[13px] font-bold uppercase tracking-[0.12em] text-ink-3">
              {col.title}
            </h2>
            <ul className="grid gap-2.5">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm font-semibold text-ink-2 hover:text-brand">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line-2">
        <div className="nk-wrap flex flex-wrap items-center justify-between gap-3.5 py-4.5">
          <p className="text-[13px] text-ink-3">© {new Date().getFullYear()} NKAMVA</p>
          <p className="text-[13px] text-ink-3">
            Paiement à l&apos;unité en FCFA · mobile money &amp; carte bancaire
          </p>
        </div>
      </div>
    </footer>
  );
}

/** Coquille des pages publiques : topbar + contenu + footer + barre d'onglets. */
export function PublicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#contenu" className="nk-skip rounded-full bg-ink px-4 py-2 font-semibold text-paper">
        Aller au contenu
      </a>
      <PublicTopbar />
      <main id="contenu" className="relative z-1 flex-1">
        {children}
      </main>
      <PublicFooter />
      {/* Réserve la hauteur de la barre : elle est `fixed`, donc hors du flux. */}
      <div aria-hidden="true" className="nk-tabbar-gap lg:hidden" />
      {/* Le visiteur n'a pas de « Plus » : ses quatre destinations tiennent, et
          la quatrième place va à la connexion (arbitrage 111). */}
      <TabBar items={VISITOR_TABS} pathname={pathname} />
    </div>
  );
}
