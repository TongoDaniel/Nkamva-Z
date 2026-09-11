import * as React from "react";
import Link from "next/link";
import { Library, Users } from "lucide-react";
import { Avatar } from "./avatar";
import { Price } from "./resource-card";
import { fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * La grille qui porte ces cartes, définie une fois pour toutes ses surfaces.
 *
 * **Trois colonnes au plus**, et dès que la place le permet. Les seuils sont
 * écrits en largeurs réelles plutôt qu'avec `sm:`/`lg:` : à 640 px, `sm:` ne
 * s'était pas encore déclenché dans une fenêtre de 583 px, où trois cartes de
 * 176 px tiennent — l'écran paraissait alors ne pas savoir se ranger. Les
 * points de rupture du produit décrivent des téléphones et des bureaux ; une
 * grille de cartes, elle, ne dépend que de la place qu'on lui donne.
 *
 * `auto-fill` a été essayé et écarté : il ne sait pas s'arrêter à trois, et
 * donnait six colonnes sur un grand écran — des cartes perdues dans la largeur
 * là où la maquette en pose trois.
 */
export const COMMUNITY_GRID =
  "grid gap-[18px] grid-cols-1 min-[400px]:grid-cols-2 min-[560px]:grid-cols-3";

/**
 * Ce qu'une carte de communauté a besoin de savoir.
 *
 * Volontairement plus pauvre que les objets qui la nourrissent : l'annuaire
 * part de `listPublicCommunities`, l'espace de `listMyMemberships`, et la
 * recherche à la frappe d'une réponse JSON. Trois sources, une seule forme.
 *
 * `coverUrl` et non `coverS3Key` : la signature d'une bannière est un geste
 * serveur, et elle expire en cinq minutes. La carte reçoit une URL déjà signée,
 * elle n'en fabrique pas — c'est ce qui lui permet d'être rendue aussi bien par
 * un composant serveur que par les résultats de recherche, côté navigateur.
 */
export interface CommunityCardData {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  priceFcfa: number;
  membersCount: number;
  /** Ressources incluses dans l'abonnement. Omis quand la source ne les compte pas. */
  includedCount?: number;
  trainerName?: string | null;
  coverUrl?: string | null;
}

/**
 * Carte de communauté, partagée par l'annuaire du visiteur, l'espace connecté
 * et les résultats de recherche.
 *
 * Elle existait en deux exemplaires — une grille à bannière dans
 * `communities-screen`, une ligne horizontale dans `/mes-communautes` — que
 * rien ne gardait d'accord. Les réunir sous un seul composant a évité les deux
 * copies suivantes : celle de la recherche, puis celle de la grille unifiée.
 *
 * Deux façons d'être cliquable, et c'est la présence d'`action` qui tranche :
 * sans elle, le lien du titre est étendu à toute la carte (une seule cible, une
 * seule tabulation) ; avec elle, il reste sur le titre — un lien qui couvre la
 * carte passerait **par-dessus** le bouton et le rendrait inatteignable.
 */
export function CommunityCard({
  community,
  href,
  badge,
  meta,
  action,
  highlight,
  eager,
  className,
}: {
  community: CommunityCardData;
  /** Cible du titre. Elle dépend de l'espace : c'est l'appelant qui la calcule. */
  href: string;
  /** Pastille posée sur la bannière — statut d'adhésion, « Ma communauté »… */
  badge?: React.ReactNode;
  /** Une ligne sous les compteurs : échéance, date de fin, ce que l'appelant sait. */
  meta?: React.ReactNode;
  /** Bouton de la carte. Sa présence retire le lien étendu (voir ci-dessus). */
  action?: React.ReactNode;
  /** Sa propre communauté : fond teinté et bordure de marque. */
  highlight?: boolean;
  /** À poser sur la première carte d'une grille, et sur elle seule (LCP). */
  eager?: boolean;
  className?: string;
}) {
  const trainerName = community.trainerName ?? null;

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-nk-lg border shadow-nk-sm transition duration-200 hover:-translate-y-1 hover:shadow-nk focus-within:-translate-y-1 focus-within:shadow-nk",
        highlight ? "border-[1.5px] border-brand/30 bg-brand-tint/40" : "border-line bg-card",
        className,
      )}
    >
      <div className="relative">
        {community.coverUrl ? (
          // `img` et non `next/image` : l'URL signée expire, le cache d'images
          // la garderait sous une clé qui lui survivrait.
          <img
            src={community.coverUrl}
            alt=""
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            className="h-[104px] w-full object-cover"
          />
        ) : (
          <div className="h-[104px] bg-gradient-to-br from-navy to-info" />
        )}
        {badge ? <div className="absolute right-2.5 top-2.5 z-1">{badge}</div> : null}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 px-5 pb-5 pt-4">
        <h2 className="text-[17px] font-extrabold leading-tight">
          <Link
            href={href}
            className={cn(
              "text-ink hover:text-brand",
              action ? null : "after:absolute after:inset-0 after:content-['']",
            )}
          >
            {community.name}
          </Link>
        </h2>

        {trainerName ? (
          <div className="flex items-center gap-2">
            <Avatar name={trainerName} size="sm" />
            <span className="truncate text-[13px] font-semibold text-ink-2">{trainerName}</span>
          </div>
        ) : null}

        {community.description ? (
          <p className="line-clamp-3 text-[13.5px] leading-relaxed text-ink-2">
            {community.description}
          </p>
        ) : null}

        <dl className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line-2 pt-4 text-[13px] text-ink-3">
          <div className="flex items-center gap-3.5">
            <span className="flex items-center gap-1.5">
              <Users className="size-3.5" aria-hidden="true" />
              {fmtNumber(community.membersCount)}
            </span>
            {community.includedCount ? (
              <span className="flex items-center gap-1.5">
                <Library className="size-3.5" aria-hidden="true" />
                {community.includedCount} incluse{community.includedCount > 1 ? "s" : ""}
              </span>
            ) : null}
          </div>
          <span>
            <Price amountFcfa={community.priceFcfa} className="text-[16px]" />
            <small className="ml-1 text-[13px] font-semibold text-ink-3">/ mois</small>
          </span>
        </dl>

        {meta ? <div className="text-[13px] text-ink-3">{meta}</div> : null}

        {/* `relative z-1` : le bouton doit rester au-dessus de la carte, même
            quand l'appelant a aussi passé un lien étendu par erreur. */}
        {action ? <div className="relative z-1 mt-0.5 flex flex-wrap gap-2">{action}</div> : null}
      </div>
    </article>
  );
}
