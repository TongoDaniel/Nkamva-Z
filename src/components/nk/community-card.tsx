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
 * `trainerAvatarUrl` et non une clé de stockage : la carte ne fabrique aucune
 * adresse, elle en reçoit une. C'est ce qui lui permet d'être rendue aussi bien
 * par un composant serveur que par des résultats de recherche, côté navigateur.
 *
 * Cette adresse-là est **stable** : la photo d'une personne passe par une route
 * qui redirige (`/api/media/users/[userId]/avatar`), pas par une URL signée qui
 * expire en cinq minutes. La bannière de la communauté, elle, en était une —
 * c'est l'une des raisons pour lesquelles elle a quitté ces cartes.
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
  /**
   * La photo du formateur qui anime la communauté, telle que la route la sert.
   * Nulle quand il n'en a pas déposé : la carte pose alors ses initiales.
   */
  trainerAvatarUrl?: string | null;
}

/**
 * Carte de communauté, partagée par l'annuaire du visiteur, l'espace connecté
 * et les résultats de recherche.
 * ==========================================================================
 * Elle existait en deux exemplaires — une grille à bannière et une ligne
 * horizontale — que rien ne gardait d'accord. Les réunir sous un seul composant
 * a évité les deux copies suivantes : celle de la recherche, puis celle de la
 * grille unifiée.
 *
 * **Elle a été raccourcie.** Sa première forme empilait sept blocs : un bandeau
 * de 104 px, le titre, le nom, trois lignes de description, les compteurs, une
 * ligne d'état, un bouton. Dans une colonne de 170 px — ce que donne une grille
 * de trois sur une fenêtre étroite — tout passait à la ligne et la carte
 * atteignait 389 px de haut pour dire quatre choses. Ce qui a changé :
 *
 *   · **l'en-tête est horizontal.** Le portrait, plus petit, se pose à côté du
 *     titre au lieu de lui voler un bandeau entier. C'est le gain principal.
 *   · **la carte s'adapte à sa propre largeur**, pas à celle de l'écran
 *     (`@container`). Une même carte n'a pas la même place dans une grille de
 *     une, deux ou trois colonnes : la description et les tailles de texte
 *     suivent la largeur **qu'elle reçoit**, ce qu'un point de rupture d'écran
 *     ne sait pas dire.
 *   · **plus de pastille « Ma communauté ».** Le bouton « Gérer » le disait
 *     déjà, et le fond teinté aussi. Les pastilles restantes portent un état
 *     qu'on ne devine pas : échéance à régler, parole retirée, résiliée.
 *
 * Deux façons d'être cliquable, et c'est la présence d'`action` qui tranche :
 * sans elle, le lien du titre est étendu à toute la carte (une seule cible, une
 * seule tabulation) ; avec elle, il reste sur le titre — un lien qui couvre la
 * carte passerait **par-dessus** le bouton et le rendrait inatteignable.
 * ==========================================================================
 */
export function CommunityCard({
  community,
  href,
  badge,
  meta,
  action,
  highlight,
  hideTrainerName,
  className,
}: {
  community: CommunityCardData;
  /** Cible du titre. Elle dépend de l'espace : c'est l'appelant qui la calcule. */
  href: string;
  /**
   * Pastille d'état — une échéance à régler, une parole retirée, une adhésion
   * résiliée. Réservée à ce qui ne se devine pas : « Ma communauté » a été
   * retirée, le bouton « Gérer » et le fond teinté le disent déjà.
   */
  badge?: React.ReactNode;
  /** Une ligne sous les compteurs : échéance, visibilité, ce que l'appelant sait. */
  meta?: React.ReactNode;
  /** Bouton de la carte. Sa présence retire le lien étendu (voir ci-dessus). */
  action?: React.ReactNode;
  /** Sa propre communauté : fond teinté et bordure de marque. */
  highlight?: boolean;
  /**
   * Cache la ligne du nom sous le titre, sans toucher au portrait. Sur sa
   * propre communauté, lire son propre nom n'apprend rien — mais le portrait
   * reste le sien, et il lui faut ce nom pour ses initiales quand aucune photo
   * n'a été déposée.
   */
  hideTrainerName?: boolean;
  className?: string;
}) {
  const trainerName = community.trainerName ?? null;

  return (
    <article
      className={cn(
        "@container group relative flex flex-col gap-3 rounded-nk-lg border p-4 shadow-nk-sm transition duration-200",
        "hover:-translate-y-0.5 hover:shadow-nk focus-within:-translate-y-0.5 focus-within:shadow-nk",
        highlight ? "border-[1.5px] border-brand/30 bg-brand-tint/40" : "border-line bg-card",
        className,
      )}
    >
      {/*
        La photo de qui anime, et non l'affiche du salon : c'est la personne
        qu'on retrouve d'une communauté à l'autre, et son visage porte mieux la
        carte qu'une bannière que beaucoup n'ont pas déposée. Son adresse est
        stable, donc elle ne se périme pas en cours de page.
      */}
      <div className="flex items-start gap-3">
        <Avatar
          size="md"
          src={community.trainerAvatarUrl ?? null}
          name={trainerName}
          alt={trainerName ? `Photo de ${trainerName}` : undefined}
          className="@min-[260px]:size-[46px]"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-extrabold leading-[1.25] @min-[260px]:text-[16.5px]">
            <Link
              href={href}
              className={cn(
                "line-clamp-2 text-ink hover:text-brand",
                action ? null : "after:absolute after:inset-0 after:content-['']",
              )}
            >
              {community.name}
            </Link>
          </h2>
          {trainerName && !hideTrainerName ? (
            <p className="truncate text-[12.5px] font-semibold text-ink-3">{trainerName}</p>
          ) : null}
        </div>
      </div>

      {/*
        La description ne paraît qu'à partir de 260 px de carte. En dessous, deux
        lignes clampées donnent trois mots et une ellipse — du bruit qui allonge.
        C'est la largeur de la **carte** qui décide, pas celle de l'écran : la
        même grille en pose une, deux ou trois par ligne selon la place.
      */}
      {community.description ? (
        <p className="hidden line-clamp-2 text-[13px] leading-relaxed text-ink-2 @min-[260px]:block">
          {community.description}
        </p>
      ) : null}

      {/*
        Les compteurs, au-dessus d'un filet : empilés quand la carte est
        étroite, sur une ligne dès qu'elle a la place.

        Et non « sur une ligne, qu'elle passe à la ligne si besoin » : un
        `flex-wrap` donnait deux lignes ragées et une hauteur qui dépendait de la
        longueur du prix — quatre pixels de trop et la carte grandissait de
        trente. Empiler franchement coûte moins haut qu'un retour à la ligne
        subi, et ne dépend pas du nombre de chiffres.
      */}
      <dl className="mt-auto flex flex-col gap-1 border-t border-line-2 pt-3 text-[12.5px] text-ink-3 @min-[260px]:flex-row @min-[260px]:items-baseline @min-[260px]:justify-between @min-[260px]:gap-x-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <Users className="size-3.5" aria-hidden="true" />
            {fmtNumber(community.membersCount)}
          </span>
          {community.includedCount ? (
            <span className="flex items-center gap-1.5">
              <Library className="size-3.5" aria-hidden="true" />
              {community.includedCount}
            </span>
          ) : null}
        </div>
        <span className="whitespace-nowrap">
          <Price amountFcfa={community.priceFcfa} className="text-[15px]" />
          <small className="ml-1 text-[12.5px] font-semibold text-ink-3">/ mois</small>
        </span>
      </dl>

      {/*
        Une pastille d'état prend sa ligne : elle réclame l'attention, et la
        mettre en concurrence avec le bouton sur la même rangée la dilue.
      */}
      {badge ? <div className="relative z-1">{badge}</div> : null}

      {/*
        La dernière rangée porte la petite ligne de fait à gauche — échéance,
        visibilité — et le bouton à droite. Les deux partagent une rangée plutôt
        que d'en prendre chacun une : c'est une trentaine de pixels de hauteur
        rendus sur chaque carte qui a un bouton. `flex-wrap` les empile quand la
        carte est trop étroite pour les deux.

        `relative z-1` : le bouton doit rester au-dessus de la carte, même si
        l'appelant a aussi passé un lien étendu par erreur.
      */}
      {meta || action ? (
        <div className="relative z-1 flex flex-wrap items-center justify-between gap-2">
          {meta ? <p className="text-[12.5px] leading-snug text-ink-3">{meta}</p> : <span />}
          {action}
        </div>
      ) : null}
    </article>
  );
}
