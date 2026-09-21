"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bell, ChevronDown, LogOut, Plus, Wallet } from "lucide-react";
import { Logo } from "@/components/nk/logo";
import { NavLink } from "@/components/nk/nav-link";
import { Avatar } from "@/components/nk/avatar";
import { TabBar } from "@/components/nk/tab-bar";
import { ShellChromeProvider } from "./shell-chrome";
import { cn } from "@/lib/utils";
import {
  accountLinksFor,
  COMPTE_TAB,
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
  avatarUrl,
  unreadMessages,
  links,
}: {
  name: string;
  email: string;
  avatarUrl: string | null;
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
          <Avatar name={name} src={avatarUrl} ring />
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
  /** Sa photo de profil. Nulle tant qu'il n'en a pas : l'avatar pose ses initiales. */
  avatarUrl: string | null;
  isTrainer: boolean;
  /** Messages reçus non lus, tous fils confondus. Compté par le layout serveur. */
  unreadMessages: number;
  /**
   * Notifications non lues. Distinctes des messages : la cloche compte ce que
   * la plateforme annonce, la pastille de la messagerie ce que les gens
   * écrivent. Les additionner ferait sonner deux fois le même événement.
   */
  unreadNotifications: number;
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

  const bar = user.isTrainer ? [...LEARNER_BAR, ...TRAINER_BAR] : LEARNER_BAR;
  const tabs = user.isTrainer ? TRAINER_TABS : LEARNER_TABS;
  const accountLinks = accountLinksFor(user.hasOpenApplication);

  const barCurrent = currentIndex(pathname, bar);

  // Écrans pleine hauteur : la messagerie n'est pas un document qu'on fait
  // défiler, c'est un poste de travail. Elle occupe exactement ce qui reste
  // entre l'en-tête et la barre d'onglets, et ne défile que dans ses deux
  // volets — la liste d'un côté, les bulles de l'autre.
  const messagerie = pathname === "/messagerie" || pathname.startsWith("/messagerie/");

  /**
   * La salle d'un direct, sur téléphone (arbitrage 147).
   *
   * Même raison que la messagerie, en plus net : une salle qui défile fait
   * sortir de l'écran les commandes de micro et de caméra dès qu'on lit le
   * salon — c'est-à-dire au moment précis où l'on veut lever la main. Elle tient
   * donc dans la fenêtre, et rien n'y défile que la liste des messages.
   *
   * **Sous `lg` seulement** : au-dessus, la scène et le panneau sont côte à
   * côte, l'écran suffit, et une page qui ne défile plus empêcherait de lire un
   * long salon.
   *
   * La console de l'animateur (`/formateur/lives/…/console`) suit la même règle
   * depuis le 16 septembre 2026 : c'est la même scène, vue de l'autre côté.
   */
  const salleLive =
    pathname.startsWith("/mes-lives/live/") ||
    (pathname.startsWith("/formateur/lives/") && pathname.endsWith("/console"));
  const fullBleed = messagerie || salleLive;

  // Un fil ouvert sur téléphone réclame l'écran entier : l'en-tête s'efface
  // sous `md`, et seulement là — au-dessus, la liste et le fil sont côte à
  // côte et rien n'est à récupérer. C'est l'écran qui le demande, par
  // `useThreadFocus` ; la coquille décide comment. Voir `shell-chrome.tsx`.
  const [threadFocus, setThreadFocus] = React.useState(false);
  const chrome = React.useMemo(() => ({ setThreadFocus }), []);

  return (
    <ShellChromeProvider value={chrome}>
      <div
        className={cn(
          "flex flex-col",
          messagerie && "h-dvh overflow-hidden",
          // La salle rend la page au défilement à partir de `lg`, là où elle
          // redevient un écran comme les autres.
          salleLive && "h-dvh overflow-hidden lg:h-auto lg:min-h-dvh lg:overflow-visible",
          !fullBleed && "min-h-dvh",
        )}
      >
        <a href="#contenu" className="nk-skip rounded-full bg-ink px-4 py-2 font-semibold text-paper">
          Aller au contenu
        </a>

        <header
          className={cn(
            "nk-glass sticky top-0 z-50 border-b border-line",
            threadFocus && "hidden md:block",
            // La salle porte son propre entête — titre, état, « Quitter ». Deux
            // barres empilées coûtaient 62 px sur 812 pour redire où l'on est.
            salleLive && "hidden lg:block",
          )}
        >
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
                      current ? "bg-ink text-paper" : "text-ink-2 hover:bg-ink/5 hover:text-ink",
                    )}
                    pendingClassName="inset-x-3.5 bottom-[5px]"
                  >
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>

            {/*
              Trois gestes, à droite, et à **tous** les seuils.

              L'ordre va du patrimoine au flux : ce qu'on a gagné, ce qu'on
              ajoute, ce qu'on reçoit. Seule la cloche est commune aux deux
              rôles — un portefeuille est attaché au profil formateur, et un
              apprenant n'a rien à publier. Il ne voit donc qu'un bouton, et
              c'est normal.

              Ces trois-là s'effaçaient à partir de `lg`, où l'avatar reprenait
              l'en-tête et où son menu portait tout. Ils restent désormais
              visibles partout : la cloche double donc l'entrée « Notifications »
              du menu du compte, et le portefeuille double sa carte dans
              l'espace formateur. Doublons assumés — un geste fréquent mérite un
              raccourci, et la liste du compte sert aussi la feuille « Plus » du
              téléphone, où la cloche n'est pas toujours à portée.

              Le bouton publier reste visible même quand l'abonnement est
              suspendu (décision 68) : c'est l'écran d'arrivée qui dit pourquoi
              ça ne passe pas. Le masquer donnerait une application qui a l'air
              cassée.
            */}
            <div className="ml-auto flex items-center gap-1 lg:gap-2">
              {user.isTrainer ? (
                <>
                  <NavLink
                    href="/formateur/portefeuille"
                    current={isActive(pathname, "/formateur/portefeuille")}
                    aria-label="Mon portefeuille"
                    className="grid size-10 place-items-center rounded-full text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink aria-[current=page]:text-brand"
                    pendingClassName="inset-x-2 bottom-1"
                  >
                    <Wallet className="size-[21px]" aria-hidden="true" />
                  </NavLink>

                  <NavLink
                    href="/formateur/ressources/nouvelle"
                    aria-label="Publier une ressource"
                    className="grid size-10 place-items-center rounded-full border-[1.5px] border-line text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
                    pendingClassName="inset-x-2 bottom-1"
                  >
                    <Plus className="size-[21px]" aria-hidden="true" />
                  </NavLink>
                </>
              ) : null}

              <NavLink
                href="/notifications"
                current={isActive(pathname, "/notifications")}
                aria-label={
                  user.unreadNotifications > 0
                    ? `Notifications, ${user.unreadNotifications} non lue${user.unreadNotifications > 1 ? "s" : ""}`
                    : "Notifications"
                }
                className="grid size-10 place-items-center rounded-full text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink aria-[current=page]:text-brand"
                pendingClassName="inset-x-2 bottom-1"
              >
                <Bell className="size-[21px]" aria-hidden="true" />
                {user.unreadNotifications > 0 ? (
                  <span
                    aria-hidden="true"
                    // 13 px, comme partout : plancher de l'arbitrage 116. Une
                    // pastille de compteur n'y échappe pas — c'est même le texte
                    // le plus petit qu'on demande de lire d'un coup d'œil.
                    className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[13px] font-bold leading-none text-white"
                  >
                    {user.unreadNotifications > 99 ? "99+" : user.unreadNotifications}
                  </span>
                ) : null}
              </NavLink>

              <div className="hidden lg:block">
                <AccountMenu
                  name={user.name}
                  email={user.email}
                  avatarUrl={user.avatarUrl}
                  unreadMessages={user.unreadMessages}
                  links={accountLinks}
                />
              </div>
            </div>
          </div>
        </header>

        <main id="contenu" className={cn("relative z-1 flex-1", fullBleed && "flex min-h-0 flex-col")}>
          {children}
        </main>

        {/*
          Pas de pied de page dans l'espace connecté.

          Il en portait un, copié de la vitrine : logo, « © 2026 NKAMVA », lien
          d'aide. Sur la vitrine il a un rôle — c'est le bas d'un site qu'on
          parcourt. Ici il n'en a aucun : on ne quitte pas ses factures par le
          logo, et une mention de copyright sous ses propres réglages ne
          renseigne personne. Il ne coûtait pas rien pour autant — sur téléphone
          il s'intercalait entre le dernier bouton de l'écran et la barre
          d'onglets, à l'endroit exact où le pouce cherche à agir.

          Ce qu'il portait d'utile — l'accès à l'aide — a rejoint les entrées du
          compte (`ACCOUNT_LINKS`), donc le menu de l'avatar et la feuille
          « Plus ». La vitrine, elle, garde le sien : voir `public-shell.tsx`.
        */}

        {/* Réserve la hauteur de la barre d'onglets : sans elle, le dernier
            bouton de chaque écran passe dessous. */}
        {salleLive ? null : <div aria-hidden="true" className="nk-tabbar-gap lg:hidden" />}

        {/*
          Pas de barre d'onglets dans une salle en direct (arbitrage 147). Elle
          coûtait 78 px de hauteur, mais surtout : en sortir par un onglet quitte
          la séance **sans la quitter** — la présence reste ouverte côté serveur,
          et la place sur la scène avec elle. « Quitter », dans l'entête de la
          salle, fait le geste proprement.
        */}
        {salleLive ? null : (
          <TabBar
            items={tabs}
            pathname={pathname}
            labels={false}
            portraitFor={COMPTE_TAB.href}
            portrait={<Avatar name={user.name} src={user.avatarUrl} size="xs" />}
          />
        )}

      </div>
    </ShellChromeProvider>
  );
}
