"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  CreditCard,
  Library,
  LogOut,
  Radio,
  Scale,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/nk/avatar";
import { NavLink } from "@/components/nk/nav-link";
import { TRAINER_SECTIONS } from "@/app/(app)/formateur/sections";
import { accountLinksFor, isActive, type NavEntry } from "@/components/layouts/nav-entries";
import { cn } from "@/lib/utils";

/**
 * Le compte, en toutes lettres.
 * ==========================================================================
 * Cinquième case de la barre. Elle ouvrait une feuille glissante ; c'est un
 * écran depuis que la barre est passée à cinq destinations et que le reste des
 * pages a dû trouver un toit. Une page plutôt qu'une feuille pour trois raisons
 * bêtes et décisives : elle a une adresse qu'on peut partager et sur laquelle
 * on peut revenir, le bouton retour du téléphone y fait ce qu'on attend, et une
 * liste de quinze entrées n'y est pas coincée dans le tiers bas de l'écran.
 *
 * Composant client, pour deux raisons qui n'en font qu'une : les icônes de
 * `nav-entries` (voir l'en-tête de ce module) et `signOut`, qui doit tourner
 * dans le navigateur.
 * ==========================================================================
 */

/**
 * Les icônes des sections formateur, attachées ici comme le fait déjà
 * `/formateur/page.tsx` : `sections.ts` est lu des deux côtés de la frontière
 * serveur/client et ne peut donc pas en porter.
 */
const SECTION_ICONS: Record<string, LucideIcon> = {
  "/formateur/ressources": Library,
  "/formateur/communaute": Users,
  "/mes-lives": Radio,
  "/formateur/portefeuille": Wallet,
  "/formateur/abonnement": CreditCard,
  "/formateur/litiges": Scale,
};

/** Une entrée de liste — même géométrie partout, une seule cible de 56 px. */
function Ligne({
  href,
  label,
  icon: Icon,
  badge,
  current,
}: NavEntry & { badge?: number; current: boolean }) {
  return (
    <li>
      <NavLink
        href={href}
        current={current}
        className={cn(
          "flex min-h-14 items-center gap-3.5 px-4 text-[15px] font-semibold transition-colors",
          current ? "bg-brand-tint text-brand-dark" : "text-ink-2 hover:bg-paper hover:text-ink",
        )}
        pendingClassName="inset-x-4 bottom-1.5"
      >
        <Icon className="size-[19px] shrink-0 text-ink-3" aria-hidden="true" />
        {label}
        {badge && badge > 0 ? (
          <span
            className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[13px] font-bold leading-none text-white"
            aria-label={`${badge} non lu${badge > 1 ? "s" : ""}`}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </NavLink>
    </li>
  );
}

/** Un bloc de la page : un titre discret, puis ses entrées sur une carte. */
function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section aria-label={titre} className="mt-6">
      <h2 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wide text-ink-3">
        {titre}
      </h2>
      <ul className="divide-y divide-line-2 overflow-hidden rounded-nk-lg border border-line bg-card shadow-nk-sm">
        {children}
      </ul>
    </section>
  );
}

export function CompteScreen({
  name,
  email,
  avatarUrl,
  isTrainer,
  hasOpenApplication,
  unreadMessages,
  unreadNotifications,
}: {
  name: string;
  email: string;
  avatarUrl: string | null;
  isTrainer: boolean;
  hasOpenApplication: boolean;
  unreadMessages: number;
  unreadNotifications: number;
}) {
  const pathname = usePathname() ?? "/compte";
  const liens = accountLinksFor(hasOpenApplication);

  // Ce qui est déjà atteignable autrement n'est pas redit ici : une même
  // destination à deux endroits de l'écran, c'est une hésitation, pas un
  // raccourci. La barre du bas en porte trois, et les sections formateur en
  // revendiquent une quatrième — « Mes lives » est à la fois une section de
  // l'espace et une entrée du compte, et se retrouvait deux fois dans la page.
  const ailleurs = new Set([
    "/mes-communautes",
    "/messagerie",
    "/catalogue",
    ...(isTrainer ? TRAINER_SECTIONS.map((section) => section.href) : []),
  ]);
  const compte = liens.filter((lien) => !ailleurs.has(lien.href));

  return (
    <div className="nk-wrap pb-10">
      {/* Pas de `PageHead` : le titre de cet écran, c'est la personne. */}
      <header className="flex items-center gap-4 pb-2 pt-8">
        <Avatar name={name} src={avatarUrl} size="lg" alt={`Photo de ${name}`} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-[22px] font-bold leading-tight">{name}</h1>
          <p className="truncate text-[13.5px] text-ink-2">{email}</p>
        </div>
      </header>

      {isTrainer ? (
        <Bloc titre="Espace formateur">
          {TRAINER_SECTIONS.map((section) => (
            <Ligne
              key={section.href}
              href={section.href}
              label={section.label}
              icon={SECTION_ICONS[section.href] ?? Library}
              current={isActive(pathname, section.href)}
            />
          ))}
        </Bloc>
      ) : null}

      <Bloc titre="Mon compte">
        {compte.map((lien) => (
          <Ligne
            key={lien.href}
            {...lien}
            current={isActive(pathname, lien.href)}
            badge={
              lien.href === "/notifications"
                ? unreadNotifications
                : lien.href === "/messagerie"
                  ? unreadMessages
                  : undefined
            }
          />
        ))}
      </Bloc>

      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/" })}
        className="mt-6 flex min-h-14 w-full cursor-pointer items-center justify-center gap-2.5 rounded-nk-lg border border-danger/30 bg-card text-[15px] font-bold text-danger transition-colors hover:bg-danger-tint"
      >
        <LogOut className="size-[19px]" aria-hidden="true" />
        Se déconnecter
      </button>
    </div>
  );
}
