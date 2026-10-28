"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
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
 * Composant client pour `signOut` et `usePathname`, qui doivent tourner dans le
 * navigateur. Ce n'était pas la seule raison : les icônes de `nav-entries` en
 * étaient une aussi, jusqu'à ce que les rangées les perdent (voir `Ligne`).
 * ==========================================================================
 */

/**
 * Une entrée de liste — même géométrie partout, une seule cible de 56 px.
 *
 * **Sans icône**, retirée le 12 septembre 2026 à la demande du propriétaire,
 * comme sur l'accueil formateur. Elle était `aria-hidden`, et quinze glyphes
 * gris empilés sur un bord ne distinguaient pas des entrées que leur libellé
 * distingue déjà. C'est pour cela que `icon` est **exclu** des props plutôt
 * qu'ignoré : `NavEntry` le garde pour la barre d'onglets, qui en a besoin,
 * mais cet écran-ci ne doit plus pouvoir en recevoir une par distraction.
 */
function Ligne({
  href,
  label,
  badge,
  current,
}: Omit<NavEntry, "icon"> & { badge?: number; current: boolean }) {
  return (
    <li>
      <NavLink
        href={href}
        current={current}
        className={cn(
          "flex min-h-14 items-center gap-3.5 px-4 text-[15px] font-semibold transition-colors",
          current ? "bg-paper font-bold text-ink" : "text-ink-2 hover:bg-paper hover:text-ink",
        )}
        pendingClassName="inset-x-4 bottom-1.5"
      >
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
    <div className="nk-wrap pb-7 sm:pb-10">
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
              current={isActive(pathname, section.href)}
            />
          ))}
        </Bloc>
      ) : null}

      <Bloc titre="Mon compte">
        {compte.map((lien) => (
          <Ligne
            key={lien.href}
            href={lien.href}
            label={lien.label}
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
        className="mt-6 flex min-h-14 w-full cursor-pointer items-center justify-center rounded-nk-lg border border-danger/30 bg-card text-[15px] font-bold text-danger transition-colors hover:bg-paper"
      >
        Se déconnecter
      </button>
    </div>
  );
}
