import * as React from "react";
import Link from "next/link";
import { Globe, Lock, Users } from "lucide-react";
import { Avatar } from "./avatar";
import { Price } from "./resource-card";
import { fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * La grille qui porte ces cartes, définie une fois pour toutes ses surfaces.
 *
 * **Deux colonnes au minimum, trois au plus.** Deux même sur un téléphone :
 * une carte par ligne faisait défiler une liste de six communautés sur trois
 * écrans, alors qu'elle ne dit que six choses. Ce qui a rendu ce minimum
 * tenable, c'est la carte elle-même — elle se replie en colonne quand elle
 * reçoit moins de 230 px (voir plus bas).
 *
 * Les seuils sont écrits en largeurs réelles plutôt qu'avec `sm:`/`lg:` : à
 * 640 px, `sm:` ne s'était pas encore déclenché dans une fenêtre de 583 px, où
 * trois cartes tiennent. Les points de rupture du produit décrivent des
 * téléphones et des bureaux ; une grille de cartes, elle, ne dépend que de la
 * place qu'on lui donne.
 *
 * `auto-fill` a été essayé et écarté : il ne sait pas s'arrêter à trois, et
 * donnait six colonnes sur un grand écran — des cartes perdues dans la largeur
 * là où la maquette en pose trois.
 */
export const COMMUNITY_GRID = "grid gap-[18px] grid-cols-2 min-[560px]:grid-cols-3";

/**
 * Ce qu'une carte de communauté a besoin de savoir — et rien de plus.
 *
 * Six choses : le visage de qui anime, le nom de la communauté, le nom du
 * formateur, le nombre d'apprenants, la marque ouverte ou privée, le prix. La
 * description a été retirée : elle valait trois lignes sur les six que la carte
 * en compte, et sa première phrase ne survivait pas à une colonne étroite.
 *
 * Volontairement plus pauvre que les objets qui la nourrissent : l'annuaire
 * part de `listPublicCommunities`, l'espace de `listMyMemberships`, et la
 * recherche à la frappe d'une réponse JSON. Trois sources, une seule forme.
 *
 * `trainerAvatarUrl` et non une clé de stockage : la carte ne fabrique aucune
 * adresse, elle en reçoit une. C'est ce qui lui permet d'être rendue aussi bien
 * par un composant serveur que par des résultats de recherche, côté navigateur.
 * Cette adresse-là est **stable** — la photo d'une personne passe par une route
 * qui redirige (`/api/media/users/[userId]/avatar`), pas par une URL signée qui
 * expire en cinq minutes.
 */
export interface CommunityCardData {
  id: string;
  slug: string;
  name: string;
  priceFcfa: number;
  membersCount: number;
  trainerName?: string | null;
  /** La photo du formateur. Nulle tant qu'il n'en a pas déposé : la carte pose ses initiales. */
  trainerAvatarUrl?: string | null;
  /**
   * Ouverte à tous, ou sur invitation (arbitrage 81). Une privée ne paraît sur
   * aucune surface publique : dans l'annuaire, la marque dit donc toujours
   * « ouverte ». Elle compte là où l'on retrouve ses propres communautés, où
   * l'une d'elles peut très bien avoir été rejointe sur invitation.
   */
  visibility?: "PUBLIC" | "PRIVATE";
}

/**
 * Carte de communauté, partagée par l'annuaire du visiteur, l'espace connecté
 * et les résultats de recherche.
 * ==========================================================================
 * Elle existait en deux exemplaires — une grille à bannière et une ligne
 * horizontale — que rien ne gardait d'accord. Les réunir sous un seul composant
 * a évité les trois copies suivantes : celle de la recherche, celle de la
 * grille unifiée, puis celle de la grille à deux colonnes.
 *
 * **Elle s'adapte à sa propre largeur** (`@container`), pas à celle de l'écran.
 * Une même carte n'a pas la même place selon que la grille en pose deux ou
 * trois par ligne, ni selon la fenêtre : c'est la largeur **qu'elle reçoit**
 * qui décide, ce qu'un point de rupture d'écran ne sait pas dire. En dessous de
 * 230 px, le portrait passe au-dessus du nom plutôt qu'à côté — un avatar de
 * 42 px et deux mots de titre ne tiennent pas côte à côte dans 100 px.
 *
 * Sa première forme empilait sept blocs et montait à 389 px de haut dans une
 * colonne de 170 px, pour dire quatre choses. Ce qui reste tient en trois :
 * l'en-tête, les trois marques, et la rangée d'état et d'action.
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
  /** Une ligne sous les marques : une échéance, une date de fin. */
  meta?: React.ReactNode;
  /** Bouton de la carte. Sa présence retire le lien étendu (voir ci-dessus). */
  action?: React.ReactNode;
  /** Sa propre communauté : fond teinté et bordure de marque. */
  highlight?: boolean;
  /**
   * Cache le nom du formateur, sans toucher au portrait. Sur sa propre
   * communauté, lire son propre nom n'apprend rien — mais le portrait reste le
   * sien, et il lui faut ce nom pour ses initiales quand aucune photo n'a été
   * déposée.
   */
  hideTrainerName?: boolean;
  className?: string;
}) {
  const trainerName = community.trainerName ?? null;

  return (
    <article
      className={cn(
        "@container group relative flex flex-col gap-2.5 rounded-nk-lg border p-3 shadow-nk-sm transition duration-200",
        "hover:-translate-y-0.5 hover:shadow-nk focus-within:-translate-y-0.5 focus-within:shadow-nk",
        "@min-[230px]:gap-3 @min-[230px]:p-4",
        highlight ? "border-[1.5px] border-brand/30 bg-brand-tint/40" : "border-line bg-card",
        className,
      )}
    >
      {/*
        La photo de qui anime, et non l'affiche du salon : c'est la personne
        qu'on retrouve d'une communauté à l'autre, et son visage porte mieux la
        carte qu'une bannière que beaucoup n'ont pas déposée.

        En colonne sous 230 px, en ligne au-dessus. Le portrait ne grandit pas
        avec la carte : à 46 px il pèse déjà son poids, et un bandeau de 104 px
        est exactement ce qu'on vient de retirer.
      */}
      <div className="flex flex-col gap-1.5 @min-[230px]:flex-row @min-[230px]:items-start @min-[230px]:gap-3">
        <Avatar
          size="md"
          src={community.trainerAvatarUrl ?? null}
          name={trainerName}
          alt={trainerName ? `Photo de ${trainerName}` : undefined}
          className="@min-[230px]:size-[46px]"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-extrabold leading-[1.25] @min-[230px]:text-[16px]">
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
            <p className="truncate text-[12px] font-semibold text-ink-3 @min-[230px]:text-[12.5px]">
              {trainerName}
            </p>
          ) : null}
        </div>
      </div>

      {/*
        Les trois marques, sous un filet : combien sont là, qui peut entrer,
        combien ça coûte. Elles s'enroulent d'elles-mêmes — trois éléments
        courts, donc une hauteur bornée à deux lignes —, et se rangent aux deux
        bouts dès que la carte a la place de les tenir sur une seule.
      */}
      <dl
        className={cn(
          "mt-auto flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line-2 pt-2.5 text-[12px] text-ink-3",
          "@min-[230px]:text-[12.5px] @min-[300px]:justify-between",
        )}
      >
        <span className="flex items-center gap-1.5">
          <Users className="size-3.5 shrink-0" aria-hidden="true" />
          {fmtNumber(community.membersCount)}
        </span>

        {community.visibility ? (
          <span className="flex items-center gap-1.5">
            {community.visibility === "PUBLIC" ? (
              <Globe className="size-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <Lock className="size-3.5 shrink-0" aria-hidden="true" />
            )}
            {community.visibility === "PUBLIC" ? "Ouverte" : "Privée"}
          </span>
        ) : null}

        <span className="whitespace-nowrap">
          <Price
            amountFcfa={community.priceFcfa}
            className="text-[13.5px] @min-[230px]:text-[15px]"
          />
          <small className="ml-1 text-[12px] font-semibold text-ink-3">/ mois</small>
        </span>
      </dl>

      {/*
        Une pastille d'état prend sa ligne : elle réclame l'attention, et la
        mettre en concurrence avec le bouton sur la même rangée la dilue.
      */}
      {badge ? <div className="relative z-1">{badge}</div> : null}

      {/*
        La dernière rangée porte la petite ligne de fait à gauche — une échéance
        — et le bouton à droite. Les deux partagent une rangée plutôt que d'en
        prendre chacun une. `flex-wrap` les empile quand la carte est trop
        étroite pour les deux.

        `relative z-1` : le bouton doit rester au-dessus de la carte, même si
        l'appelant a aussi passé un lien étendu par erreur.
      */}
      {meta || action ? (
        <div className="relative z-1 flex flex-wrap items-center justify-between gap-2">
          {meta ? <p className="text-[12px] leading-snug text-ink-3">{meta}</p> : <span />}
          {action}
        </div>
      ) : null}
    </article>
  );
}
