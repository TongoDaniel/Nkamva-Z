"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Bell,
  ChevronDown,
  FileText,
  Heart,
  LogOut,
  MessageSquare,
  Menu,
  Radio,
  Settings,
  ShoppingBag,
  Users,
  X,
  Library,
} from "lucide-react";
import { Logo } from "@/components/nk/logo";
import { Avatar } from "@/components/nk/avatar";
import { cn } from "@/lib/utils";
import { TRAINER_SECTIONS } from "@/app/(app)/formateur/sections";

const LEARNER_NAV = [
  { href: "/accueil", label: "Accueil" },
  // `/catalogue` et non `/ressources` : la version visiteur du catalogue rend
  // la coquille publique, avec « Se connecter » — on sortait de son espace en
  // cliquant sur un onglet de sa propre barre de navigation.
  { href: "/catalogue", label: "Catalogue" },
  { href: "/mes-ressources", label: "Mes ressources" },
  { href: "/mes-achats", label: "Mes achats" },
];

/**
 * Un formateur reste un apprenant : sa navigation ajoute, elle ne remplace pas.
 * Une seule entrée sur grand écran, et non les six de l'espace : alignés
 * derrière les quatre onglets apprenant, ils débordaient la barre. Les cinq
 * sections vivent dans la sous-navigation de `/formateur` — et sont dépliées
 * sous cette entrée dans le menu mobile, qui n'a pas cette contrainte de place.
 */
const TRAINER_NAV = [{ href: "/formateur", label: "Espace formateur" }];

/**
 * Le menu du compte reprend la barre latérale apprenant de la maquette. Les
 * quatre écrans encore en démonstration (lives, replays, messagerie) y figurent
 * : les cacher rendrait leur état invisible et personne ne les relirait.
 */
const ACCOUNT_LINKS = [
  { href: "/mes-ressources", label: "Mes ressources", icon: Library },
  { href: "/mes-communautes", label: "Mes communautés", icon: Users },
  { href: "/mes-lives", label: "Mes lives", icon: Radio },
  { href: "/messagerie", label: "Messagerie", icon: MessageSquare },
  { href: "/favoris", label: "Favoris", icon: Heart },
  { href: "/mes-achats", label: "Mes achats", icon: ShoppingBag },
  // Juste après les achats, parce que c'en est la pièce comptable — et non sous
  // « Profil et paramètres », où une facture n'est pas un réglage.
  { href: "/mes-factures", label: "Mes factures", icon: FileText },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/profil", label: "Profil et paramètres", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Pastille de non-lus, posée à droite d'une entrée du menu. */
function UnreadBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      className="ml-auto grid min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-white"
      aria-label={`${count} non lu${count > 1 ? "s" : ""}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function AccountMenu({
  name,
  email,
  unreadMessages,
}: {
  name: string;
  email: string;
  unreadMessages: number;
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
            <small className="block truncate text-[12.5px] text-ink-3">{email}</small>
          </div>
          {ACCOUNT_LINKS.map(({ href, label, icon: Icon }) => (
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
}

/**
 * Coquille de l'espace connecté : topbar applicative + pied de page compact.
 * `user` vient du layout serveur : sans lui, `useSession()` est vide au premier
 * rendu et la navigation formateur n'apparaîtrait qu'après hydratation.
 */
export function AppShell({ children, user }: { children: React.ReactNode; user: ShellUser }) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = React.useState(false);
  const nav = user.isTrainer ? [...LEARNER_NAV, ...TRAINER_NAV] : LEARNER_NAV;

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#contenu" className="nk-skip rounded-full bg-ink px-4 py-2 font-semibold text-paper">
        Aller au contenu
      </a>

      <header className="sticky top-0 z-50 border-b border-line bg-paper/90 backdrop-blur-md">
        <div className="nk-wrap flex h-[62px] items-center gap-4 md:h-[70px] md:gap-7">
          <Logo href="/accueil" compact />

          <nav aria-label="Navigation de mon espace" className="hidden flex-1 gap-1 min-[820px]:flex">
            {nav.map((item) => (
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
            <AccountMenu
              name={user.name}
              email={user.email}
              unreadMessages={user.unreadMessages}
            />
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="nk-app-nav"
              aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
              className="nk-tap relative grid size-[42px] cursor-pointer place-items-center rounded-xl border border-line bg-card text-ink min-[820px]:hidden"
            >
              {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
            </button>
          </div>
        </div>

        <nav
          id="nk-app-nav"
          aria-label="Navigation de mon espace (mobile)"
          hidden={!open}
          // Le panneau est ancré à un en-tête `sticky` : ce qui dépasse le bas
          // de l'écran ne se rattrape pas en faisant défiler la page. Depuis
          // que les cinq sections formateur s'y déplient, la liste passe la
          // hauteur d'un téléphone — elle défile donc en son sein. `dvh` et non
          // `vh` : la barre d'adresse mobile mange la différence.
          className="absolute inset-x-0 top-full z-[120] max-h-[calc(100dvh-62px)] overflow-y-auto overscroll-contain border-b border-line bg-paper px-4.5 pb-4.5 pt-2.5 shadow-nk md:max-h-[calc(100dvh-70px)] min-[820px]:hidden"
        >
          {nav.map((item) => {
            // Les cinq sections de l'espace formateur sont dépliées ici : sous
            // 820px la sous-navigation de `/formateur` n'est atteignable qu'une
            // fois dans l'espace, ce qui coûtait un écran de plus pour ouvrir
            // son portefeuille. Le parent n'est alors marqué courant que sur
            // l'égalité stricte — sinon deux entrées porteraient `aria-current`.
            const sections = item.href === "/formateur" ? TRAINER_SECTIONS : [];
            const current = sections.length
              ? pathname === item.href
              : isActive(pathname, item.href);
            return (
              <React.Fragment key={item.href}>
                <Link
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className="block border-b border-line-2 px-1.5 py-3.5 text-base font-bold text-ink hover:text-brand"
                >
                  {item.label}
                </Link>
                {sections.map((section) => {
                  const active = isActive(pathname, section.href);
                  return (
                    <Link
                      key={section.href}
                      href={section.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block border-b border-line-2 border-l-2 py-3 pl-4 pr-1.5 text-[15px] font-semibold hover:border-l-brand hover:text-brand",
                        active ? "border-l-brand text-brand" : "border-l-line text-ink-2",
                      )}
                    >
                      {section.label}
                    </Link>
                  );
                })}
              </React.Fragment>
            );
          })}

          {/* Sous 820px le menu du compte n'existe pas : sans ce rappel, les
              écrans qu'il contient seraient injoignables sur mobile. */}
          {ACCOUNT_LINKS.filter((link) => !nav.some((item) => item.href === link.href)).map(
            ({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className="flex items-center gap-2.5 border-b border-line-2 px-1.5 py-3.5 text-[15px] font-semibold text-ink-2 hover:text-brand"
              >
                <Icon className="size-4 text-ink-3" aria-hidden="true" />
                {label}
              </Link>
            ),
          )}
        </nav>
      </header>

      <main id="contenu" className="relative z-1 flex-1">
        {children}
      </main>

      <footer className="mt-[72px] border-t border-line bg-card">
        <div className="nk-wrap flex flex-wrap items-center gap-4.5 py-6.5">
          <Logo className="text-base" />
          <p className="text-[13px] text-ink-3">
            © {new Date().getFullYear()} NkamVa
          </p>
          <Link href="/aide" className="ml-auto text-[13px] font-semibold text-ink-2 hover:text-brand">
            Aide
          </Link>
        </div>
      </footer>
    </div>
  );
}
