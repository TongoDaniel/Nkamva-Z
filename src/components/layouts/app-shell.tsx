"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Bell,
  ChevronDown,
  FileBadge,
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
import { NavLink } from "@/components/nk/nav-link";
import { Avatar } from "@/components/nk/avatar";
import { cn } from "@/lib/utils";
import { TRAINER_SECTIONS } from "@/app/(app)/formateur/sections";

interface NavItem {
  href: string;
  label: string;
  /**
   * Routes rattachées à cet onglet : elles l'allument faute d'avoir une entrée
   * à elles. Sans ça, ouvrir ses factures éteint toute la barre — plus rien ne
   * dit où l'on se trouve.
   */
  related?: string[];
}

const LEARNER_NAV: NavItem[] = [
  // « Accueil » n'a plus d'onglet : le logo de l'en-tête y mène déjà, sur
  // toutes les tailles d'écran et sur toutes les routes. Deux entrées pour la
  // même destination, l'une juste à droite de l'autre, ne servaient qu'à
  // occuper de la place dans une barre qui en manque.
  //
  // La route reste rattachée à rien : aucun onglet ne s'allume sur `/accueil`,
  // et c'est exact — on n'y est dans aucune des quatre sections.
  // Le catalogue n'a plus d'onglet : on y entre par « Explorer le catalogue »
  // depuis ses ressources, et son fil d'Ariane y remonte. Il reste rattaché à
  // cet onglet pour que la barre continue de dire où l'on est.
  //
  // `/catalogue` et non `/ressources` : la version visiteur du catalogue rend
  // la coquille publique, avec « Se connecter » — on sortirait de son espace.
  { href: "/mes-ressources", label: "Mes ressources", related: ["/catalogue"] },
  // `/catalogue/communautes` est plus précis que le `/catalogue` ci-dessus :
  // c'est cet onglet-là qui l'emporte, voir `currentIndex()`.
  { href: "/mes-communautes", label: "Mes communautés", related: ["/catalogue/communautes"] },
  // Factures et contestations pendent des achats : leur fil d'Ariane y remonte,
  // l'onglet le dit aussi.
  { href: "/mes-achats", label: "Mes achats", related: ["/mes-factures", "/mes-litiges"] },
];

/**
 * Un formateur reste un apprenant : sa navigation ajoute, elle ne remplace pas.
 * Une seule entrée sur grand écran, et non les six de l'espace : alignés
 * derrière les quatre onglets apprenant, ils débordaient la barre. Les cinq
 * sections vivent dans la sous-navigation de `/formateur` — et sont dépliées
 * sous cette entrée dans le menu mobile, qui n'a pas cette contrainte de place.
 */
const TRAINER_NAV: NavItem[] = [{ href: "/formateur", label: "Espace formateur" }];

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

/**
 * L'entrée vers le dossier de candidature, ajoutée au menu du compte tant qu'un
 * dossier est en cours.
 *
 * Elle n'est pas dans `ACCOUNT_LINKS` parce qu'elle n'est pas permanente : elle
 * naît à la création du dossier et disparaît à la décision. Sans elle, un
 * candidat n'avait **aucun chemin** vers son suivi une fois la page quittée —
 * ni onglet, ni menu, ni notification cliquable. Il fallait connaître l'URL.
 *
 * `/candidature` et non `/candidature/statut` : c'est la page qui sait où
 * envoyer selon l'état du dossier — la saisie tant qu'il reste à compléter, le
 * suivi une fois parti.
 */
const APPLICATION_LINK = {
  href: "/candidature",
  label: "Ma candidature",
  icon: FileBadge,
} as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Le href par lequel cet onglet revendique la route courante, ou `null`.
 *
 * On renvoie le href plutôt qu'un booléen parce que deux onglets peuvent
 * revendiquer la même route : sur `/catalogue/communautes`, « Mes ressources »
 * matche par `/catalogue` et « Mes communautés » par le chemin entier. La
 * longueur départage — le plus précis gagne.
 *
 * `listed` porte les href qui ont déjà leur propre entrée dans la même liste :
 * le menu mobile déplie « Mes factures » sous le compte, et un onglet ne doit
 * pas lui disputer le marqueur de page courante.
 */
function claimedHref(pathname: string, item: NavItem, listed?: Set<string>) {
  const candidates = [
    item.href,
    ...(item.related ?? []).filter((href) => !listed?.has(href)),
  ];
  let best: string | null = null;
  for (const href of candidates) {
    if (isActive(pathname, href) && (!best || href.length > best.length)) best = href;
  }
  return best;
}

/** Index de l'onglet courant dans `items`, ou -1 si aucun ne revendique la route. */
function currentIndex(pathname: string, items: NavItem[], listed?: Set<string>) {
  let index = -1;
  let length = 0;
  items.forEach((item, i) => {
    const href = claimedHref(pathname, item, listed);
    if (href && href.length > length) {
      index = i;
      length = href.length;
    }
  });
  return index;
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
  links,
}: {
  name: string;
  email: string;
  unreadMessages: number;
  links: readonly { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
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
 * Coquille de l'espace connecté : topbar applicative + pied de page compact.
 * `user` vient du layout serveur : sans lui, `useSession()` est vide au premier
 * rendu et la navigation formateur n'apparaîtrait qu'après hydratation.
 */
export function AppShell({ children, user }: { children: React.ReactNode; user: ShellUser }) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = React.useState(false);
  const nav = user.isTrainer ? [...LEARNER_NAV, ...TRAINER_NAV] : LEARNER_NAV;
  // Le suivi du dossier se range juste avant « Profil et paramètres » : c'est
  // du compte qu'il relève, pas du catalogue. Un formateur approuvé ne le voit
  // plus — son dossier est clos, son espace a pris le relais.
  const accountLinks = user.hasOpenApplication
    ? [...ACCOUNT_LINKS.slice(0, -1), APPLICATION_LINK, ACCOUNT_LINKS[ACCOUNT_LINKS.length - 1]]
    : ACCOUNT_LINKS;
  // Ce que le menu mobile ajoute sous les onglets : les écrans du menu du
  // compte qui n'ont pas déjà leur entrée. Le calcul sert deux fois — pour les
  // rendre, et pour savoir quelles routes rattachées y ont déjà un titulaire.
  // Les sections formateur dépliées plus bas revendiquent leurs href au même
  // titre que les onglets : « Mes sessions » pointe vers `/mes-lives` depuis la
  // fusion des deux agendas, et le menu du compte porte déjà cette entrée. Sans
  // cette seconde exclusion, le panneau mobile offrirait deux fois la même page
  // et y poserait deux `aria-current`.
  const expandedSections = user.isTrainer ? TRAINER_SECTIONS : [];
  const burgerLinks = accountLinks.filter(
    (link) =>
      !nav.some((item) => item.href === link.href) &&
      !expandedSections.some((section) => section.href === link.href),
  );
  const burgerHrefs = new Set(burgerLinks.map((link) => link.href));
  // Le menu du compte ne marque aucune entrée courante : dans la barre du haut,
  // rien ne dispute à un onglet ses routes rattachées.
  const barCurrent = currentIndex(pathname, nav);
  const burgerCurrent = currentIndex(pathname, nav, burgerHrefs);

  React.useEffect(() => {
    setOpen(false);
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
            {nav.map((item, index) => {
              const current = index === barCurrent;
              return (
                <NavLink
                  key={item.href}
                  href={item.href}
                  current={current}
                  className={cn(
                    "rounded-full px-3.5 py-2 text-[14.5px] font-semibold transition duration-150",
                    current
                      ? "bg-ink text-paper"
                      : "text-ink-2 hover:bg-white/70 hover:text-ink",
                  )}
                  pendingClassName="inset-x-3.5 bottom-[5px]"
                >
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2.5">
            <AccountMenu
              name={user.name}
              email={user.email}
              unreadMessages={user.unreadMessages}
              links={accountLinks}
            />
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="nk-app-nav"
              aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
              className="nk-tap relative grid size-[42px] cursor-pointer place-items-center rounded-xl border border-line bg-card text-ink lg:hidden"
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
          className="absolute inset-x-0 top-full z-[120] max-h-[calc(100dvh-62px)] overflow-y-auto overscroll-contain border-b border-line bg-paper px-4.5 pb-4.5 pt-2.5 shadow-nk md:max-h-[calc(100dvh-70px)] lg:hidden"
        >
          {nav.map((item, index) => {
            // Les cinq sections de l'espace formateur sont dépliées ici : sous
            // 820px la sous-navigation de `/formateur` n'est atteignable qu'une
            // fois dans l'espace, ce qui coûtait un écran de plus pour ouvrir
            // son portefeuille. Le parent n'est alors marqué courant que sur
            // l'égalité stricte — sinon deux entrées porteraient `aria-current`.
            const sections = item.href === "/formateur" ? TRAINER_SECTIONS : [];
            const current = sections.length
              ? pathname === item.href
              : index === burgerCurrent;
            return (
              <React.Fragment key={item.href}>
                <NavLink
                  href={item.href}
                  current={current}
                  className="block border-b border-line-2 px-1.5 py-3.5 text-base font-bold text-ink hover:text-brand"
                  pendingClassName="inset-x-1.5 bottom-1.5"
                >
                  {item.label}
                </NavLink>
                {sections.map((section) => {
                  const active = isActive(pathname, section.href);
                  return (
                    <NavLink
                      key={section.href}
                      href={section.href}
                      current={active}
                      className={cn(
                        "block border-b border-line-2 border-l-2 py-3 pl-4 pr-1.5 text-[15px] font-semibold hover:border-l-brand hover:text-brand",
                        active ? "border-l-brand text-brand" : "border-l-line text-ink-2",
                      )}
                      pendingClassName="inset-x-4 bottom-1"
                    >
                      {section.label}
                    </NavLink>
                  );
                })}
              </React.Fragment>
            );
          })}

          {/* Sous 820px le menu du compte n'existe pas : sans ce rappel, les
              écrans qu'il contient seraient injoignables sur mobile. */}
          {burgerLinks.map(
            ({ href, label, icon: Icon }) => (
              <NavLink
                key={href}
                href={href}
                current={isActive(pathname, href)}
                className="flex items-center gap-2.5 border-b border-line-2 px-1.5 py-3.5 text-[15px] font-semibold text-ink-2 hover:text-brand"
                pendingClassName="inset-x-1.5 bottom-1.5"
              >
                <Icon className="size-4 text-ink-3" aria-hidden="true" />
                {label}
              </NavLink>
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
