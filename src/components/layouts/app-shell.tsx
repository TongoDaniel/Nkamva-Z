"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut } from "lucide-react";
import { Logo } from "@/components/nk/logo";
import { NavLink } from "@/components/nk/nav-link";
import { Avatar } from "@/components/nk/avatar";
import { Sheet } from "@/components/nk/sheet";
import { TabBar } from "@/components/nk/tab-bar";
import { cn } from "@/lib/utils";
import { TRAINER_SECTIONS } from "@/app/(app)/formateur/sections";
import {
  accountLinksFor,
  currentIndex,
  isActive,
  LEARNER_BAR,
  LEARNER_TABS,
  TRAINER_BAR,
  TRAINER_TABS,
  type NavEntry,
} from "./nav-entries";

/** Pastille de non-lus, posée à droite d'une entrée du menu. */
function UnreadBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      className="ml-auto grid min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[13px] font-bold text-white"
      aria-label={`${count} non lu${count > 1 ? "s" : ""}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Menu du compte, à partir de `lg`. Sur téléphone, les mêmes entrées se
 * déplient dans la feuille « Plus » — arbitrage 112 : une liste, deux rendus.
 */
function AccountMenu({
  name,
  email,
  unreadMessages,
  links,
}: {
  name: string;
  email: string;
  unreadMessages: number;
  links: readonly NavEntry[];
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Menu du compte"
          className="group relative flex cursor-pointer items-center gap-1.5 rounded-full"
        >
          <Avatar name={name} ring />
          <ChevronDown
            className="size-4 text-ink-2 transition-transform group-data-[state=open]:rotate-180"
            aria-hidden="true"
          />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={12}
          className={cn(
            "z-90 w-[280px] rounded-nk-lg border border-line bg-card p-2.5 shadow-nk-lg",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          )}
        >
          <div className="mb-1.5 border-b border-line-2 px-3 pb-3.5 pt-3">
            <b className="block font-display text-[14.5px]">{name}</b>
            <small className="block truncate text-[13px] text-ink-3">{email}</small>
          </div>
          {links.map(({ href, label, icon: Icon }) => (
            <DropdownMenu.Item key={href} asChild>
              <Link
                href={href}
                className="flex cursor-pointer items-center gap-3 rounded-nk-sm px-3 py-2.5 text-sm font-semibold text-ink-2 outline-none hover:bg-paper hover:text-ink data-highlighted:bg-paper data-highlighted:text-ink"
              >
                <Icon className="size-[17px] text-ink-3" aria-hidden="true" />
                {label}
                {href === "/messagerie" ? <UnreadBadge count={unreadMessages} /> : null}
              </Link>
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1.5 h-px bg-line-2" />
          <DropdownMenu.Item asChild>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="flex w-full cursor-pointer items-center gap-3 rounded-nk-sm px-3 py-2.5 text-left text-sm font-semibold text-danger outline-none hover:bg-danger-tint data-highlighted:bg-danger-tint"
            >
              <LogOut className="size-[17px]" aria-hidden="true" />
              Se déconnecter
            </button>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export interface ShellUser {
  name: string;
  email: string;
  isTrainer: boolean;
  /** Messages reçus non lus, tous fils confondus. Compté par le layout serveur. */
  unreadMessages: number;
  /**
   * Vrai tant qu'un dossier de candidature est en cours — la décision n'est pas
   * tombée, ou elle demande de nouvelles pièces. Lu par le layout serveur : le
   * JWT ne porte que le rôle, et `PENDING_TRAINER` ne couvre pas le brouillon.
   */
  hasOpenApplication: boolean;
}

/**
 * Coquille de l'espace connecté.
 *
 * Deux navigations, une seule source d'entrées (`nav-entries.ts`) :
 * - à partir de `lg`, la barre haute de la maquette et le menu de l'avatar ;
 * - en dessous, la **barre d'onglets basse** (arbitrage 111) et la feuille
 *   « Plus », toutes deux dans le tiers bas de l'écran.
 *
 * `user` vient du layout serveur : sans lui, `useSession()` est vide au premier
 * rendu et la navigation formateur n'apparaîtrait qu'après hydratation.
 */
export function AppShell({ children, user }: { children: React.ReactNode; user: ShellUser }) {
  const pathname = usePathname() ?? "/";
  const [moreOpen, setMoreOpen] = React.useState(false);

  const bar = user.isTrainer ? [...LEARNER_BAR, ...TRAINER_BAR] : LEARNER_BAR;
  const tabs = user.isTrainer ? TRAINER_TABS : LEARNER_TABS;
  const accountLinks = accountLinksFor(user.hasOpenApplication);

  // Ce que la feuille « Plus » ajoute : les écrans du compte qui n'ont pas déjà
  // leur onglet, et les sections formateur dépliées. Sans ce calcul, la feuille
  // proposerait deux fois la même page et y poserait deux `aria-current`.
  const sections = user.isTrainer ? TRAINER_SECTIONS : [];
  const sheetLinks = accountLinks.filter(
    (link) =>
      !tabs.some((tab) => tab.href === link.href) &&
      !sections.some((section) => section.href === link.href),
  );

  const barCurrent = currentIndex(pathname, bar);
  // « Plus » s'allume quand la route courante n'appartient à aucun onglet : sans
  // ça, ouvrir ses factures éteint toute la barre et plus rien ne dit où l'on est.
  const moreActive = currentIndex(pathname, tabs) === -1;

  // La feuille se referme dès que la route change.
  React.useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#contenu" className="nk-skip rounded-full bg-ink px-4 py-2 font-semibold text-paper">
        Aller au contenu
      </a>

      <header className="sticky top-0 z-50 border-b border-line bg-paper/90 backdrop-blur-md">
        <div className="nk-wrap flex h-[62px] items-center gap-4 md:h-[70px] md:gap-7">
          <Logo href="/accueil" compact />

          <nav aria-label="Navigation de mon espace" className="hidden flex-1 gap-1 lg:flex">
            {bar.map((item, index) => {
              const current = index === barCurrent;
              return (
                <NavLink
                  key={item.href}
                  href={item.href}
                  current={current}
                  className={cn(
                    "rounded-full px-3.5 py-2 text-[14.5px] font-semibold transition duration-150",
                    current ? "bg-ink text-paper" : "text-ink-2 hover:bg-white/70 hover:text-ink",
                  )}
                  pendingClassName="inset-x-3.5 bottom-[5px]"
                >
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          {/* Sous `lg`, l'avatar ne porte plus de menu : tout le compte vit dans
              la feuille « Plus », à portée de pouce. Il reste ici comme repère
              du compte connecté, et comme raccourci vers le profil. */}
          <div className="ml-auto flex items-center gap-2.5">
            <Link
              href="/profil"
              aria-label="Mon profil"
              className="nk-tap relative lg:hidden"
            >
              <Avatar name={user.name} ring />
            </Link>
            <div className="hidden lg:block">
              <AccountMenu
                name={user.name}
                email={user.email}
                unreadMessages={user.unreadMessages}
                links={accountLinks}
              />
            </div>
          </div>
        </div>
      </header>

      <main id="contenu" className="relative z-1 flex-1">
        {children}
      </main>

      <footer className="mt-[72px] border-t border-line bg-card">
        <div className="nk-wrap flex flex-wrap items-center gap-4.5 py-6.5">
          <Logo className="text-base" />
          <p className="text-[13px] text-ink-3">© {new Date().getFullYear()} NkamVa</p>
          <Link href="/aide" className="nk-tap ml-auto text-[13px] font-semibold text-ink-2 hover:text-brand">
            Aide
          </Link>
        </div>
      </footer>

      {/* Réserve la hauteur de la barre d'onglets : sans elle, le pied de page
          et le dernier bouton de chaque écran passent dessous. */}
      <div aria-hidden="true" className="nk-tabbar-gap lg:hidden" />

      <TabBar
        items={tabs}
        pathname={pathname}
        onMore={() => setMoreOpen(true)}
        moreActive={moreActive}
      />

      <Sheet open={moreOpen} onOpenChange={setMoreOpen} title="Mon compte" description={user.email}>
        <ul className="grid gap-0.5">
          {sections.map((section) => (
            <li key={section.href}>
              <NavLink
                href={section.href}
                current={isActive(pathname, section.href)}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-nk-sm px-3 text-[15px] font-semibold",
                  isActive(pathname, section.href) ? "bg-brand-tint text-brand-dark" : "text-ink-2",
                )}
              >
                {section.label}
              </NavLink>
            </li>
          ))}
          {sections.length ? <li className="my-1.5 h-px bg-line-2" role="separator" /> : null}

          {sheetLinks.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <NavLink
                href={href}
                current={isActive(pathname, href)}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-nk-sm px-3 text-[15px] font-semibold",
                  isActive(pathname, href) ? "bg-brand-tint text-brand-dark" : "text-ink-2",
                )}
              >
                <Icon className="size-[18px] shrink-0 text-ink-3" aria-hidden="true" />
                {label}
                {href === "/messagerie" ? <UnreadBadge count={user.unreadMessages} /> : null}
              </NavLink>
            </li>
          ))}

          <li className="my-1.5 h-px bg-line-2" role="separator" />
          <li>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-nk-sm px-3 text-left text-[15px] font-semibold text-danger"
            >
              <LogOut className="size-[18px] shrink-0" aria-hidden="true" />
              Se déconnecter
            </button>
          </li>
        </ul>
      </Sheet>
    </div>
  );
}
