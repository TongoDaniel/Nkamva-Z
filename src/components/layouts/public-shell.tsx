"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Logo } from "@/components/nk/logo";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/ressources", label: "Ressources" },
  { href: "/formateurs", label: "Formateurs" },
  { href: "/tarifs", label: "Tarifs" },
  { href: "/aide", label: "Aide" },
];

const FOOTER_COLUMNS: Array<{ title: string; links: Array<{ href: string; label: string }> }> = [
  {
    title: "Explorer",
    links: [
      { href: "/ressources", label: "Catalogue" },
      { href: "/formateurs", label: "Formateurs" },
      { href: "/tarifs", label: "Tarifs" },
    ],
  },
  {
    title: "Formateurs",
    links: [
      { href: "/devenir-formateur", label: "Devenir formateur" },
      { href: "/aide", label: "Centre d'aide" },
      { href: "/contact", label: "Nous contacter" },
    ],
  },
  {
    title: "Légal",
    links: [
      { href: "/legal/conditions", label: "Conditions d'utilisation" },
      { href: "/legal/confidentialite", label: "Confidentialité" },
      { href: "/legal/mentions", label: "Mentions légales" },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Barre supérieure publique — port de `.topbar` + `.mnav`. */
export function PublicTopbar() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = React.useState(false);

  // Le menu mobile se referme dès que la route change.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper/90 backdrop-blur-md">
      <div className="nk-wrap flex h-[62px] items-center gap-4 md:h-[70px] md:gap-7">
        <Logo compact />

        <nav aria-label="Navigation principale" className="hidden flex-1 gap-1 min-[820px]:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={cn(
                "rounded-full px-3.5 py-2 text-[14.5px] font-semibold transition duration-150",
                isActive(pathname, item.href)
                  ? "bg-ink text-paper"
                  : "text-ink-2 hover:bg-white/70 hover:text-ink",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <Btn asChild variant="t" size="sm" className="max-[820px]:hidden">
            <Link href="/auth/connexion">Se connecter</Link>
          </Btn>
          <Btn asChild variant="p" size="sm">
            <Link href="/auth/inscription">Créer un compte</Link>
          </Btn>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="nk-mobile-nav"
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            className="grid size-[42px] cursor-pointer place-items-center rounded-xl border border-line bg-card text-ink min-[820px]:hidden"
          >
            {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      <nav
        id="nk-mobile-nav"
        aria-label="Navigation principale (mobile)"
        hidden={!open}
        className="absolute inset-x-0 top-full z-[120] border-b border-line bg-paper px-4.5 pb-4.5 pt-2.5 shadow-nk min-[820px]:hidden"
      >
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
            className="block border-b border-line-2 px-1.5 py-3.5 text-base font-bold text-ink hover:text-brand"
          >
            {item.label}
          </Link>
        ))}
        <div className="mt-4 flex gap-2.5">
          <Btn asChild variant="o" size="sm" className="flex-1">
            <Link href="/auth/connexion">Se connecter</Link>
          </Btn>
          <Btn asChild variant="p" size="sm" className="flex-1">
            <Link href="/auth/inscription">Créer un compte</Link>
          </Btn>
        </div>
      </nav>
    </header>
  );
}

/** Pied de page public — port de `.bigfoot`. */
export function PublicFooter() {
  return (
    <footer className="mt-[72px] border-t border-line bg-card">
      <div className="nk-wrap grid gap-10 py-[52px_40px] sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-[34ch] text-sm leading-relaxed text-ink-2">
            Cours vidéo, guides et modèles créés par des formateurs africains. Payez à l&apos;unité,
            en FCFA — la ressource reste à vous, à vie.
          </p>
        </div>
        {FOOTER_COLUMNS.map((col) => (
          <div key={col.title}>
            <h2 className="mb-3.5 mt-1.5 font-sans text-xs font-bold uppercase tracking-[0.12em] text-ink-3">
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
          <p className="text-[13px] text-ink-3">
            © {new Date().getFullYear()} NkamVa. Tous droits réservés.
          </p>
          <ul className="flex flex-wrap gap-2" aria-label="Moyens de paiement acceptés">
            {["Orange Money", "MTN MoMo", "Wave", "Airtel Money", "M-Pesa", "Carte bancaire"].map(
              (p) => (
                <li
                  key={p}
                  className="rounded-[7px] border border-line bg-paper px-2.5 py-1.5 text-[11px] font-bold leading-none text-ink-2"
                >
                  {p}
                </li>
              ),
            )}
          </ul>
        </div>
      </div>
    </footer>
  );
}

/** Coquille des pages publiques : topbar + contenu + footer. */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#contenu" className="nk-skip rounded-full bg-ink px-4 py-2 font-semibold text-paper">
        Aller au contenu
      </a>
      <PublicTopbar />
      <main id="contenu" className="relative z-1 flex-1">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
