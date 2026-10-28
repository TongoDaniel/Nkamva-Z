import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Globe, Lock, MessageSquareOff, Users } from "lucide-react";
import { Avatar } from "./avatar";
import { coverStripes } from "./cover";
import { Price } from "./resource-card";
import { StPill } from "./status-pill";
import { fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * La grille qui porte ces cartes, définie une fois pour toutes ses surfaces.
 *
 * **Deux colonnes au minimum, trois à partir de `sm`.** Deux même sur un
 * téléphone : une carte par ligne faisait défiler une liste de six communautés
 * sur trois écrans, alors qu'elle ne dit que six choses. Ce qui a rendu ce
 * minimum tenable, c'est la carte elle-même — elle se replie en colonne quand
 * elle reçoit moins de 256 px (voir plus bas).
 *
 * Des seuils en largeurs réelles — une variante `min-` suivie d'une largeur en
 * pixels — ont été écrits ici puis retirés : l'arbitrage 110 fait de l'échelle
 * Tailwind la source unique des points de rupture, et `scripts/smoke-mobile.ts`
 * le garde (le garde-fou lit aussi les commentaires, d'où cette périphrase). La conséquence est
 * assumée — dans une fenêtre de 583 px il reste deux colonnes là où trois
 * tiendraient, mais deux était le minimum demandé, et une échelle partagée vaut
 * mieux qu'un seuil juste pour cette grille.
 *
 * `auto-fill` a été essayé et écarté : il ne sait pas s'arrêter à trois, et
 * donnait six colonnes sur un grand écran — des cartes perdues dans la largeur
 * là où la maquette en pose trois.
 */
export const COMMUNITY_GRID = "grid gap-[18px] grid-cols-2 sm:grid-cols-3";

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
 * La pastille d'une adhésion, réservée à ce qui demande une décision ou explique
 * un silence. Partagée par `/mes-communautes` et les vignettes de l'accueil :
 * l'échéance à régler doit se lire pareil aux deux endroits.
 */
export function membershipBadge({
  status,
  canceled,
}: {
  status: string;
  canceled: boolean;
}): React.ReactNode {
  if (status === "PAST_DUE") {
    return (
      <StPill tone="warn">
        <AlertTriangle className="size-3.5" aria-hidden="true" /> Échéance à régler
      </StPill>
    );
  }
  if (status === "BANNED") {
    return (
      <StPill tone="muted">
        <MessageSquareOff className="size-3.5" aria-hidden="true" /> Parole retirée
      </StPill>
    );
  }
  if (canceled) return <StPill tone="muted">Résiliée</StPill>;
  return null;
}

/**
 * Les adresses d'une vignette — produites côté serveur par `thumbnailOf`
 * (`lib/community-visual.ts`). Aucune clé de stockage ne descend jusqu'ici.
 */
export interface ThumbnailSrc {
  /** La bannière de la communauté. */
  cover: string | null;
  /** Photo de groupe, sinon portrait du formateur. */
  portrait: string | null;
}

/**
 * Vignette d'une communauté : sa bannière si elle en a une, sinon un portrait
 * posé sur le fond rayé des couvertures vides — le même que celui des
 * ressources, pour qu'il n'existe qu'une famille d'images absentes.
 *
 * Décorative (`aria-hidden`) : le nom de la communauté la jouxte partout.
 */
export function CommunityThumb({
  thumbnail,
  name,
  compact,
  className,
}: {
  thumbnail: ThumbnailSrc;
  /** Porte les initiales, et choisit la teinte des rayures. */
  name: string;
  /** Portrait réduit, pour une vignette de rangée. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("relative grid shrink-0 place-items-center overflow-hidden", className)}
      style={thumbnail.cover ? undefined : { background: coverStripes(name) }}
      aria-hidden="true"
    >
      {thumbnail.cover ? (
        // `img` et non `next/image` : l'adresse est signée pour cinq minutes, et
        // l'optimiseur la mettrait en cache au-delà — même raison que `Cover`.
        <img
          src={thumbnail.cover}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <Avatar size={compact ? "sm" : "lg"} src={thumbnail.portrait} name={name} ring />
      )}
    </div>
  );
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
 * `@3xs` — 256 px, l'échelle des conteneurs — le portrait passe au-dessus du
 * nom plutôt qu'à côté : un avatar de 42 px et deux mots de titre ne tiennent
 * pas côte à côte dans 100 px.
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
  thumbnail,
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
  /**
   * Sa présence fait passer la carte en **vignette** — l'image en tête, le nom
   * et le formateur dessous —, la forme des rangées défilantes de l'accueil.
   * Les marques (membres, visibilité, prix) n'y figurent pas : on y retrouve
   * ses propres communautés, où le prix déjà payé n'apprend rien. `meta` et
   * `action` y sont ignorés ; `badge` reste, parce qu'une échéance à régler
   * doit se voir partout.
   */
  thumbnail?: ThumbnailSrc;
  className?: string;
}) {
  const trainerName = community.trainerName ?? null;

  if (thumbnail) {
    return (
      <article
        className={cn(
          "group relative flex flex-col overflow-hidden rounded-nk-lg border border-line bg-card shadow-nk-sm transition duration-200",
          "hover:-translate-y-0.5 hover:shadow-nk focus-within:-translate-y-0.5 focus-within:shadow-nk",
          className,
        )}
      >
        <CommunityThumb thumbnail={thumbnail} name={community.name} className="aspect-video w-full" />
        <div className="flex flex-1 flex-col gap-1 px-3.5 pb-3.5 pt-3">
          {/* `h3` : la vignette vit sous le titre d'une section de page. */}
          <h3 className="text-[15px] font-bold leading-snug">
            <Link
              href={href}
              className="line-clamp-2 text-ink after:absolute after:inset-0 after:content-[''] hover:text-brand"
            >
              {community.name}
            </Link>
          </h3>
          {trainerName && !hideTrainerName ? (
            <p className="truncate text-[13px] text-ink-3">{trainerName}</p>
          ) : null}
          {badge ? <div className="relative z-1 mt-auto pt-1">{badge}</div> : null}
        </div>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "@container group relative flex flex-col gap-2.5 rounded-nk-lg border p-3 shadow-nk-sm transition duration-200",
        "hover:-translate-y-0.5 hover:shadow-nk focus-within:-translate-y-0.5 focus-within:shadow-nk",
        "@3xs:gap-3 @3xs:p-4",
        highlight ? "border-[1.5px] border-brand bg-card ring-1 ring-brand" : "border-line bg-card",
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
      <div className="flex flex-col gap-1.5 @3xs:flex-row @3xs:items-start @3xs:gap-3">
        <Avatar
          size="md"
          src={community.trainerAvatarUrl ?? null}
          name={trainerName}
          alt={trainerName ? `Photo de ${trainerName}` : undefined}
          className="@3xs:size-[46px]"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-extrabold leading-[1.25] @3xs:text-[16px]">
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
            <p className="truncate text-[13px] font-semibold text-ink-3 @3xs:text-[13px]">
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
          "mt-auto flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line-2 pt-2.5 text-[13px] text-ink-3",
          "@3xs:text-[13px] @3xs:justify-between",
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
            className="text-[13.5px] @3xs:text-[15px]"
          />
          <small className="ml-1 text-[13px] font-semibold text-ink-3">/ mois</small>
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
          {meta ? <p className="text-[13px] leading-snug text-ink-3">{meta}</p> : <span />}
          {action}
        </div>
      ) : null}
    </article>
  );
}
