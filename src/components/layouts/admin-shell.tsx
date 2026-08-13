"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  BadgeCheck, BarChart3, Coins, CreditCard, FileClock, Gavel, LayoutDashboard,
  LogOut, Menu, PiggyBank, Plug, Receipt, RefreshCw, Settings, ShieldAlert, ShieldCheck, Undo2,
  TicketPercent, UserCog, Users, Wallet, X,
} from "lucide-react";
import { Avatar } from "@/components/nk/avatar";
import { NavLink } from "@/components/nk/nav-link";
import { cn } from "@/lib/utils";

import { navForSubRole, type AdminNavGroup } from "./admin-nav";

export type { AdminSubRole, AdminNavItem, AdminNavGroup } from "./admin-nav";
export { navForSubRole } from "./admin-nav";

/**
 * Rubriques admin, icônes comprises. Elles restent dans ce module client : une
 * icône est un composant React, et un composant serveur ne peut pas en passer
 * un en prop à un composant client.
 *
 * C'est aussi la source unique de vérité sur le périmètre admin restant à
 * construire.
 */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    title: "Pilotage",
    items: [
      { href: "/admin", label: "Tableau de bord", icon: LayoutDashboard },
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3, roles: [] },
    ],
  },
  {
    title: "Modération",
    items: [
      { href: "/admin/validation-formateurs", label: "Validation formateurs", icon: BadgeCheck, roles: ["MODERATION"] },
      { href: "/admin/litiges", label: "Litiges", icon: Gavel, roles: ["MODERATION"] },
      { href: "/admin/signalements", label: "Signalements", icon: ShieldAlert, roles: ["MODERATION"] },
    ],
  },
  {
    title: "Finances",
    items: [
      { href: "/admin/transactions", label: "Transactions", icon: Receipt, roles: ["FINANCES"] },
      { href: "/admin/remboursements", label: "Remboursements", icon: Undo2, roles: ["FINANCES"] },
      { href: "/admin/moyens-de-paiement", label: "Moyens de paiement", icon: CreditCard, roles: ["FINANCES"] },
      { href: "/admin/retraits", label: "Retraits", icon: Wallet, roles: ["FINANCES"] },
      // Finances voit les écarts — c'est elle que le job alerte ; seul le
      // Super-admin corrige, et l'écran n'affiche le bouton qu'à lui.
      { href: "/admin/portefeuilles", label: "Portefeuilles", icon: PiggyBank, roles: ["FINANCES"] },
      { href: "/admin/abonnements", label: "Abonnements", icon: RefreshCw, roles: ["FINANCES"] },
      // Arbitrage 105 — un registre métier n'est pas un journal d'audit. Le
      // premier se consulte pour travailler, le second pour contrôler ; seul le
      // second est réservé au Super-admin (décision 7). Sans cet écran, un admin
      // Finances accordait des remises qu'il ne pouvait plus relire.
      { href: "/admin/remises", label: "Remises", icon: TicketPercent, roles: ["FINANCES"] },
      // Un taux décide de ce que paie réellement un apprenant hors zone franc :
      // même porte que la grille tarifaire.
      { href: "/admin/taux-de-change", label: "Taux de change", icon: Coins, roles: ["FINANCES"] },
    ],
  },
  {
    title: "Administration",
    items: [
      // Décision 7 — Finances a une lecture seule sur les utilisateurs ; le
      // journal d'audit et les paramètres restent au Super-admin.
      { href: "/admin/utilisateurs", label: "Utilisateurs", icon: Users, roles: ["FINANCES"] },
      { href: "/admin/administrateurs", label: "Administrateurs", icon: UserCog, roles: [] },
      { href: "/admin/journal-audit", label: "Journal d'audit", icon: FileClock, roles: [] },
      { href: "/admin/parametres", label: "Paramètres", icon: Settings, roles: [] },
      // Nomme les variables d'environnement du déploiement et le mode réel de
      // chaque fournisseur — Super-admin, au même titre que les paramètres.
      { href: "/admin/integrations", label: "Intégrations", icon: Plug, roles: [] },
    ],
  },
  {
    // Sans `roles` — donc visible par les trois sous-rôles. C'est le seul
    // écran de cette navigation qui parle du compte de la personne et non de
    // la plateforme, d'où sa rubrique à part : rangé sous « Administration »,
    // il se confondrait avec « Administrateurs », qui gère celui des autres.
    title: "Mon accès",
    items: [{ href: "/admin/mon-compte", label: "Mon compte", icon: ShieldCheck }],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Coquille admin — port de `.adm-shell` / `.adm-side` / `.adm-main`. */
export interface AdminUser {
  name: string;
  email: string;
  adminRole: string | null;
}

export function AdminShell({
  children,
  user,
  pendingApplications = 0,
}: {
  children: React.ReactNode;
  /** Fourni par le layout serveur : `useSession()` est vide au premier rendu. */
  user: AdminUser;
  /**
   * Dossiers formateur en attente d'instruction, compté côté serveur.
   *
   * C'est un **nombre**, et pas la navigation déjà décorée : `ADMIN_NAV` est
   * exporté depuis ce module client, et un composant serveur qui l'importe ne
   * reçoit pas le tableau mais la référence client que React met à sa place.
   * Le layout appelait `nav.map()` dessus — ce qui faisait tomber en 500 tout
   * l'espace d'administration dès qu'une candidature était en attente, donc
   * précisément quand la pastille servait à quelque chose.
   */
  pendingApplications?: number;
}) {
  const pathname = usePathname() ?? "/admin";
  const [open, setOpen] = React.useState(false);
  const { name, email, adminRole } = user;

  // Décision 7 — le filtrage se fait ici, pas dans le layout : la navigation
  // porte des icônes, qui ne peuvent pas traverser la frontière serveur. La
  // pastille se pose au même endroit, pour la même raison.
  const visibleNav = React.useMemo(() => {
    const decorated: AdminNavGroup[] =
      pendingApplications > 0
        ? ADMIN_NAV.map((group) => ({
            ...group,
            items: group.items.map((item) =>
              item.href === "/admin/validation-formateurs"
                ? { ...item, badge: pendingApplications }
                : item,
            ),
          }))
        : ADMIN_NAV;
    return navForSubRole(decorated, adminRole);
  }, [pendingApplications, adminRole]);

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Échap referme le tiroir mobile.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Tiroir ouvert : la page dessous ne doit pas défiler. Sans ça, un geste sur
  // le voile fait glisser le contenu masqué et le tiroir paraît décroché.
  React.useEffect(() => {
    if (!open) return;
    document.body.classList.add("nk-drawer-open");
    return () => document.body.classList.remove("nk-drawer-open");
  }, [open]);

  return (
    <div className="nk-admin flex min-h-screen bg-paper">
      <a href="#contenu" className="nk-skip rounded-full bg-ink px-4 py-2 font-semibold text-paper">
        Aller au contenu
      </a>

      {/* En-tête mobile (`.adm-mtop`) */}
      <div className="sticky top-0 z-60 flex items-center gap-3 border-b border-line bg-card px-4.5 py-3.5 min-[861px]:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="nk-admin-nav"
          aria-label="Ouvrir la navigation"
          className="nk-tap relative grid size-[38px] shrink-0 cursor-pointer place-items-center rounded-nk-sm border border-line bg-card"
        >
          <Menu className="size-[19px]" aria-hidden="true" />
        </button>
        <b className="font-display text-base font-extrabold tracking-[-0.01em]">
          Nkam<em className="not-italic">Va</em>
        </b>
        <span className="rounded-md bg-paper px-1.5 py-1 text-[9px] font-extrabold tracking-[0.12em] text-ink-3">
          ADMIN
        </span>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-90 bg-black/45 min-[861px]:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <nav
        id="nk-admin-nav"
        aria-label="Navigation administration"
        className={cn(
          "z-100 flex w-[250px] shrink-0 flex-col overflow-y-auto bg-linear-to-b from-ink to-[#0f1712] text-[#f3f1ea]",
          "max-[860px]:fixed max-[860px]:inset-y-0 max-[860px]:left-0 max-[860px]:transition-transform max-[860px]:duration-250",
          "min-[861px]:sticky min-[861px]:top-0 min-[861px]:h-screen",
          open ? "max-[860px]:translate-x-0 max-[860px]:shadow-nk-lg" : "max-[860px]:-translate-x-full",
        )}
      >
        <div className="flex items-center gap-2.5 px-5 pb-4 pt-5.5">
          <span
            className="grid size-[34px] shrink-0 place-items-center rounded-nk-sm bg-brand shadow-[inset_0_-2px_0_rgba(0,0,0,.2)] font-display text-[17px] font-extrabold text-white"
            aria-hidden="true"
          >
            N
          </span>
          <b className="font-display text-[17px] font-extrabold tracking-[-0.01em] text-white">
            Nkam<em className="not-italic text-[#7fd4b4]">Va</em>
          </b>
          <span className="ml-auto rounded-md bg-white/10 px-1.5 py-1 text-[9.5px] font-extrabold tracking-[0.13em] text-[#98a49b]">
            ADMIN
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fermer la navigation"
            className="grid size-8 cursor-pointer place-items-center rounded-nk-sm text-[#98a49b] hover:bg-white/10 hover:text-white min-[861px]:hidden"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 px-3.5 pb-3.5">
          {visibleNav.map((group) => (
            <div key={group.title} className="flex flex-col gap-0.5">
              <h2 className="mb-1.5 px-2.5 font-sans text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#98a49b]">
                {group.title}
              </h2>
              {group.items.map(({ href, label, icon: Icon, badge }) => {
                const active = isActive(pathname, href);
                return (
                  <NavLink
                    key={href}
                    href={href}
                    current={active}
                    className={cn(
                      "flex items-center gap-3 rounded-nk-sm px-2.5 py-2.5 text-[13.7px] font-semibold transition duration-150",
                      active ? "bg-brand text-white" : "text-[#98a49b] hover:bg-white/[0.06] hover:text-white",
                    )}
                    pendingClassName="inset-x-2.5 bottom-1"
                  >
                    <Icon className="size-[17px] shrink-0" aria-hidden="true" />
                    {label}
                    {badge ? (
                      <span
                        className={cn(
                          "ml-auto min-w-4 rounded-full px-1 text-center text-[10px] font-extrabold leading-4",
                          active ? "bg-white text-brand-dark" : "bg-gold text-[#241a02]",
                        )}
                      >
                        {badge}
                      </span>
                    ) : null}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 border-t border-white/10 px-4.5 pb-5 pt-3.5">
          {/* Le bloc d'identité mène au compte : c'est là qu'on le cherche,
              bien avant de parcourir la navigation. */}
          <Link
            href="/admin/mon-compte"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-nk-sm hover:opacity-80"
          >
            <Avatar name={name} size="sm" />
            <div className="min-w-0">
              <b className="block truncate text-[13.3px] text-white">{name}</b>
              <small className="block truncate text-[11.3px] text-[#98a49b]">
                {adminRole ?? email}
              </small>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            aria-label="Se déconnecter"
            className="ml-auto grid size-8 shrink-0 cursor-pointer place-items-center rounded-nk-sm text-[#98a49b] hover:bg-white/[0.06] hover:text-white"
          >
            <LogOut className="size-4" aria-hidden="true" />
          </button>
        </div>
      </nav>

      <main id="contenu" className="min-w-0 flex-1 px-4.5 pb-12 pt-5.5 md:px-8.5 md:pb-16 md:pt-7.5">
        {children}
      </main>
    </div>
  );
}

/** En-tête de page admin — port de `.adm-head`. */
export function AdminHead({
  title,
  lead,
  actions,
}: {
  title: string;
  lead?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6.5 flex flex-wrap items-start justify-between gap-6">
      <div>
        <h1 className="mb-1 text-[26px] font-extrabold">{title}</h1>
        {lead ? <p className="text-[14.5px] text-ink-2">{lead}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}

/** Carte de contenu admin — port de `.adm-card`. */
export function AdminCard({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm", className)}
      aria-label={title}
    >
      {title || action ? (
        <div className="mb-4.5 flex flex-wrap items-center justify-between gap-3.5">
          {title ? <h2 className="text-[16.5px] font-extrabold">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
